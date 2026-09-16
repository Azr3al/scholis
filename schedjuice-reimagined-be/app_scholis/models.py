"""
Tenant-scoped state for the Scholis integration.

One Schedjuice tenant is one school is one Scholis organisation, so every model
here lives in the tenant schema and there is at most one ``ScholisConnection``
per tenant. Nothing in this file is shared: a leaked row exposes one school.

The gradebook mapping, and the one place this integration loses information:

    Scholis paper  ->  ScholisPaperLink  ->  ResultColumn (one gradebook column)
    Scholis section ->  the JSON breakdown on ScholisScore
    Scholis score   ->  ScholisScore.score      (decimal, exact)
                    ->  ResultCell.marks        (integer, rounded)

``ResultCell.marks`` is a ``PositiveIntegerField`` and Scholis scores are
decimals -- a rubric tier can be worth 2.5. Rather than migrate a column the
whole gradebook UI reads, the exact value is kept here and the rounded one is
written there, so a report card can always be recomputed from the source of
truth and the rounding is a recorded decision rather than silent data loss.
Grade boundaries stay in ``app_grading_reports.GradingScale``: Scholis returns
raw marks and refuses to compute a letter grade, because it cannot know a
school's bands.
"""
from __future__ import annotations

import secrets
from decimal import ROUND_HALF_UP, Decimal

from django.db import models

from utilitas.models import BaseModel


#: Scholis's credential is ``sch_live_<keyId>.<secret>`` (apps/api/server/
#: api-credential.ts). The prefix is not decoration: their ``parseCredential``
#: rejects any token that does not start with it, and secret scanners match on it.
#: So the prefix has to be put back on the way out, not only taken off on the way
#: in -- storing the secret half and presenting it bare is a 401 on every call.
CREDENTIAL_PREFIX = "sch_live_"


def _secret_half(token: str) -> str:
    """The secret half of a Scholis credential, or the whole string if it is not one."""
    body = (
        token[len(CREDENTIAL_PREFIX) :]
        if token.startswith(CREDENTIAL_PREFIX)
        else token
    )
    _, _, secret = body.partition(".")
    return secret


def _generate_token() -> str:
    """URL-safe, 256 bits. Used for the inbound webhook path."""
    return secrets.token_urlsafe(32)


class ScholisConnection(BaseModel):
    """
    This tenant's link to its Scholis organisation.

    One row per tenant, enforced by ``is_active`` being a "chosen one" field --
    ``BaseModel.save`` clears it everywhere else, so there is never a question of
    which connection is live.
    """

    # Chosen-one semantics from BaseModel: at most one True in the table.
    chosen_one_fields = ["is_active"]

    is_active = models.BooleanField(default=True)

    # The identifier this tenant is known by at Scholis. Sent as `externalRef`
    # when provisioning, which is what makes that call idempotent: a timeout and
    # a retry find the same school instead of creating a second one.
    external_ref = models.CharField(max_length=200, unique=True)

    school_name = models.CharField(max_length=200, blank=True, default="")

    scholis_org_id = models.UUIDField(null=True, blank=True)

    # The org-tier credential. `api_key_id` is not secret and is kept in the
    # clear because it identifies the key in Scholis's dashboard and in their
    # audit log; the secret half is Fernet-encrypted.
    api_key_id = models.CharField(max_length=120, blank=True, default="")
    api_key_secret_encrypted = models.TextField(blank=True, default="")

    # Webhook endpoint registered at Scholis, and the secret it signs with.
    # Scholis returns the secret exactly once, at registration, so losing it
    # means registering a new endpoint -- it cannot be fetched again.
    webhook_endpoint_id = models.UUIDField(null=True, blank=True)
    webhook_signing_secret_encrypted = models.TextField(blank=True, default="")
    webhook_token = models.CharField(
        max_length=64, unique=True, default=_generate_token
    )

    # Highest event sequence fully processed. Drives catch-up: after an outage,
    # GET /events?since=<this> replays what was missed.
    #
    # Scholis sends seq as a JSON string, because a JavaScript number cannot hold
    # a 64-bit integer faithfully. That constraint is theirs, not ours: Postgres
    # bigint and Python int are both exact here, so it is stored as an integer.
    # Storing the string instead would make ordering lexicographic, and "9" sorts
    # after "10" -- a catch-up cursor that skips events is worse than one that
    # never advances.
    last_event_seq = models.BigIntegerField(null=True, blank=True)

    connected_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"<ScholisConnection {self.external_ref} org={self.scholis_org_id}>"

    # -- secrets -----------------------------------------------------------
    #
    # Exposed as properties so no query, serializer or admin can accidentally
    # select the ciphertext and hand it to a caller. Getting the plaintext costs
    # a decrypt, which is a deliberate speed bump.

    @property
    def api_token(self) -> str:
        """
        The full ``sch_live_<keyId>.<secret>`` bearer token, reassembled.

        Only the secret half is stored encrypted; the key id is kept in the clear
        because it identifies the key in Scholis's dashboard and in their audit
        log. Both halves are needed to call them, so this puts them back together.
        """
        from app_scholis.crypto import decrypt_secret

        secret = decrypt_secret(self.api_key_secret_encrypted)
        if not secret:
            return ""
        if not self.api_key_id:
            # Nothing to reassemble: whatever was stored is already whole.
            return secret
        return f"{CREDENTIAL_PREFIX}{self.api_key_id}.{secret}"

    @property
    def webhook_signing_secret(self) -> str:
        from app_scholis.crypto import decrypt_secret

        return decrypt_secret(self.webhook_signing_secret_encrypted)

    @property
    def has_credentials(self) -> bool:
        return bool(self.api_key_id) and bool(self.api_key_secret_encrypted)

    @property
    def webhook_path(self) -> str:
        """
        The public path Scholis posts to.

        It carries the schema name because an inbound delivery has no
        ``X-Tenant`` header and no browser ``Origin`` -- the two things the tenant
        middleware resolves from -- so without it the middleware would park the
        request in whatever the fallback tenant is and the signing secret would
        be looked up in the wrong schema. Precedent for putting a tenant in a
        path is ``/media/<domain>/...``, which the same middleware already
        parses.

        The token is not the authentication; the HMAC signature is. It exists so
        that a guessed schema name still cannot reach a connection, and so that
        re-registering an endpoint rotates the path.
        """
        from django.db import connection

        # The schema this row was read from, which is the schema the caller is
        # already inside -- a request resolved by the tenant middleware, or a
        # Celery task wrapped in schema_context by TenantTask.
        schema = getattr(connection, "schema_name", "") or getattr(
            getattr(connection, "tenant", None), "schema_name", ""
        )
        return f"scholis/webhooks/{schema}/{self.webhook_token}"

    def set_api_key(self, *, key_id: str, token: str) -> None:
        """
        Store an org credential from the ``sch_live_<keyId>.<secret>`` form.

        The token Scholis returns is the whole bearer string. Splitting it here
        means the id stays queryable for support while the secret half is
        encrypted, and a caller cannot store one without the other.
        """
        from app_scholis.crypto import encrypt_secret

        secret = _secret_half(token)
        self.api_key_id = key_id
        self.api_key_secret_encrypted = encrypt_secret(secret or token)

    def set_webhook(self, *, endpoint_id: str, signing_secret: str) -> None:
        from app_scholis.crypto import encrypt_secret

        self.webhook_endpoint_id = endpoint_id
        self.webhook_signing_secret_encrypted = encrypt_secret(signing_secret)


class ScholisPaperLink(BaseModel):
    """
    One Scholis paper bound to one gradebook column.

    The binding is explicit and stored, rather than inferred from a matching
    title, because a title can be edited on either side and a mark written into
    the wrong column is worse than a mark not written at all.
    """

    connection = models.ForeignKey(
        ScholisConnection, on_delete=models.CASCADE, related_name="paper_links"
    )
    # Scholis's paper id. Unique per tenant: one paper fills one column.
    scholis_test_id = models.UUIDField()
    scholis_test_title = models.CharField(max_length=255, blank=True, default="")

    # This system's course id, sent to Scholis so it can be echoed back on score
    # rows. Matching on it is what lets a score find its course without trusting
    # a title.
    course = models.ForeignKey(
        "app_course.Course",
        on_delete=models.CASCADE,
        related_name="scholis_paper_links",
        null=True,
        blank=True,
    )

    # The gradebook column this paper writes into. SET_NULL rather than CASCADE:
    # deleting a column should not delete the record of what a student scored.
    column = models.ForeignKey(
        "app_grading_reports.ResultColumn",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="scholis_paper_links",
    )

    # Scholis's own maximum for the paper, decimal and exact. Cached so the
    # gradebook can show "out of" without a round trip, and so a change on their
    # side is visible as a difference rather than a surprise.
    max_score = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )

    # Section titles and maximums, for a column that combines skills. Kept as
    # JSON because the sections belong to Scholis's paper and modelling them here
    # would mean mirroring a schema this app does not own.
    sections = models.JSONField(default=list, blank=True)

    is_active = models.BooleanField(default=True)
    linked_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="scholis_paper_links",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["connection", "scholis_test_id"],
                name="scholis_paper_link_unique_test",
            )
        ]
        ordering = ["id"]

    def __str__(self) -> str:
        return f"<ScholisPaperLink {self.scholis_test_id} -> column {self.column_id}>"


class ScholisScore(BaseModel):
    """
    One student's released result for one paper, exactly as Scholis reported it.

    This is the authoritative copy. ``ResultCell.marks`` is a rounded projection
    of it, kept because the gradebook UI reads integers; if the rounding policy
    ever changes, every cell can be recomputed from here without asking Scholis
    again.

    Keyed on ``attempt_id``, which Scholis guarantees unique, so a re-release of
    the same paper updates the row instead of duplicating it.
    """

    link = models.ForeignKey(
        ScholisPaperLink, on_delete=models.CASCADE, related_name="scores"
    )
    attempt_id = models.UUIDField(unique=True)

    # Null for a walk-in attempt: somebody sat the paper without being launched
    # from here, so there is no student row to attribute it to. Keeping the score
    # rather than dropping it matters -- the mark exists and a teacher should be
    # able to see that it is unattributed.
    student = models.ForeignKey(
        "app_auth.User",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="scholis_scores",
    )
    # The `studentRef` we sent at launch, echoed back. Matching on this rather
    # than on the name is the point: a name is display-only and a student types
    # their own.
    student_ref = models.CharField(max_length=120, blank=True, default="")
    taker_name = models.CharField(max_length=255, blank=True, default="")

    score = models.DecimalField(max_digits=8, decimal_places=2)
    max_score = models.DecimalField(max_digits=8, decimal_places=2)

    # Per-section breakdown as reported: [{sectionId, title, score, maxScore}].
    sections = models.JSONField(default=list, blank=True)

    submitted_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)

    # When this row was written into the gradebook, and what was written. Null
    # means it has not been synced yet, which is how a failed sync is retried
    # without re-fetching everything.
    synced_at = models.DateTimeField(null=True, blank=True)
    synced_marks = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-released_at", "id"]
        indexes = [
            models.Index(fields=["link", "student"], name="scholis_score_link_student")
        ]

    def __str__(self) -> str:
        return f"<ScholisScore attempt={self.attempt_id} {self.score}/{self.max_score}>"

    @property
    def rounded_marks(self) -> int:
        """
        Half-up to an integer, which is what a teacher expects 12.5 to become.

        Python's built-in ``round()`` is banker's rounding and would send 12.5 to
        12 -- defensible in statistics, surprising on a report card, and not what
        the same teacher gets from a spreadsheet.
        """
        return int(self.score.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


class ScholisWebhookEvent(BaseModel):
    """
    Every delivery Scholis has sent, whether or not it was understood.

    Written before processing and unique on ``event_id``, which makes the
    receiver idempotent: Scholis retries a delivery it did not get a 2xx for, and
    a retry must not write a student's marks twice.

    Also the audit trail. A disputed mark is answerable from this table without
    asking Scholis to reconstruct anything.
    """

    connection = models.ForeignKey(
        ScholisConnection, on_delete=models.CASCADE, related_name="webhook_events"
    )
    event_id = models.UUIDField(unique=True)
    # Integer for the same reason as ScholisConnection.last_event_seq: a text
    # sequence cannot be compared or ordered numerically.
    #
    # Nullable because Scholis sends seq as a string and a delivery could carry
    # something unparseable. Zero would be a lie -- it is a real position in their
    # sequence -- and a null says plainly that this event's position is unknown,
    # which is why it leaves the catch-up cursor alone.
    seq = models.BigIntegerField(null=True, blank=True)
    type = models.CharField(max_length=120)
    subject_type = models.CharField(max_length=120, blank=True, default="")
    subject_id = models.CharField(max_length=200, blank=True, default="")
    payload = models.JSONField(default=dict, blank=True)
    occurred_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)

    processed_at = models.DateTimeField(null=True, blank=True)
    # Kept rather than raised: a delivery this app does not understand yet is
    # still worth storing, because "we saw it and ignored it" and "we never saw
    # it" are different facts to a person debugging a missing mark.
    error = models.TextField(blank=True, default="")

    # True when the row came from GET /events rather than a push. Same handling,
    # but the distinction is what makes a gap in deliveries visible.
    from_catch_up = models.BooleanField(default=False)

    class Meta:
        ordering = ["-received_at", "id"]
        indexes = [
            models.Index(fields=["connection", "seq"], name="scholis_event_conn_seq")
        ]

    def __str__(self) -> str:
        return f"<ScholisWebhookEvent {self.type} seq={self.seq}>"


class ScholisLaunch(BaseModel):
    """
    Audit of a minted student ticket.

    The URL is deliberately not stored. It is a bearer credential that admits a
    named student to an exam, it is valid for fifteen minutes, and writing it to
    a database would turn every reader of that database into somebody who can sit
    an exam as somebody else. The fact that a link was issued, for whom, and when
    it expired is what needs to survive.
    """

    connection = models.ForeignKey(
        ScholisConnection, on_delete=models.CASCADE, related_name="launches"
    )
    link = models.ForeignKey(
        ScholisPaperLink,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="launches",
    )
    student = models.ForeignKey(
        "app_auth.User",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="scholis_launches",
    )
    scholis_test_id = models.UUIDField()
    taker_ref = models.CharField(max_length=120)
    taker_name = models.CharField(max_length=255, blank=True, default="")
    expires_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        "app_auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="scholis_launches_issued",
    )

    class Meta:
        ordering = ["-id"]

    def __str__(self) -> str:
        return f"<ScholisLaunch {self.taker_ref} test={self.scholis_test_id}>"
