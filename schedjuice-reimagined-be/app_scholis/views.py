"""
HTTP surface for the Scholis integration.

Two kinds of endpoint live here and they authenticate completely differently.

Everything under ``scholis/`` except the webhook is a normal RBAC view: a signed-in
Schedjuice user, gated on a permission that already exists in
``app_rbac.catalog``. No new permission codes are introduced, deliberately -- a
brand-new code is granted to nobody until an administrator edits roles, so the
feature would ship dark and the first person to try it would get a 403 with no
idea why.

The webhook has no user at all. It authenticates with an HMAC over the exact
bytes received, and it is the one endpoint here that must not go through the
tenant middleware's normal resolution: an inbound delivery carries no
``X-Tenant`` header and no browser ``Origin``, which are the two things that
middleware resolves a tenant from. So the schema is in the path and the view
enters it explicitly.
"""
from __future__ import annotations

import logging

from django.db import connection as db_connection
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.views import APIView
from tenant_schemas.utils import schema_context, schema_exists

from app_course.course_scoping import acting_user
from app_rbac.views import RBACView
from app_scholis import serializers
from app_scholis.errors import ScholisError, ScholisUnauthorizedError
from app_scholis.models import ScholisPaperLink, ScholisScore, ScholisConnection
from app_scholis.signatures import (
    SIGNATURE_HEADER,
    TIMESTAMP_HEADER,
    SignatureRejected,
    verify as verify_signature,
)
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication

logger = logging.getLogger(__name__)

_AUTH = [TenantBoundJWTStatelessAuthentication]


class ScholisConnectView(RBACView):
    """
    POST — provision this tenant at Scholis and register the webhook.

    Gated on ``organization.manage`` rather than a grading permission: this
    creates a school-level relationship with an external system and stores a live
    credential. It is a setup act, and it is idempotent, so pressing it twice is
    safe.
    """

    authentication_classes = _AUTH
    required_permissions = {"POST": "organization.manage", "GET": "organization.manage"}

    def get(self, request):
        from app_scholis.provisioning import get_active_connection

        connection = get_active_connection()
        if connection is None:
            return self.ok({"connected": False})
        return self.ok(serializers.connection_status(connection))

    def post(self, request):
        from app_scholis.provisioning import connect_tenant

        school_name = (request.data.get("school_name") or "").strip() or None
        try:
            status = connect_tenant(school_name=school_name)
        except ScholisError as e:
            return self._error(e)
        return self.ok(serializers.connection_status(status.connection))

    def _error(self, e: ScholisError):
        # A missing platform key is a deployment problem, not something the
        # person clicking "Connect" can fix, and saying so saves a support ticket.
        if isinstance(e, ScholisUnauthorizedError):
            return self.bad_request({"message": e.message})
        return self.bad_request({"message": e.message})


class ScholisPaperLinkView(RBACView):
    """
    GET/POST — the bindings between Scholis papers and gradebook columns.

    Writing a binding is ``grade.manage`` because it decides which column a
    class's marks land in. Reading allows ``grade.view_all`` as well, matching how
    the rest of the gradebook is gated.
    """

    authentication_classes = _AUTH
    required_permissions = {
        "GET": ["grade.manage", "grade.view_all"],
        "POST": "grade.manage",
    }

    def get(self, request):
        links = ScholisPaperLink.objects.select_related("column", "course").order_by(
            "id"
        )
        return self.ok([serializers.paper_link(x) for x in links])

    def post(self, request):
        from app_scholis.papers import link_paper

        data = serializers.parse_paper_link_request(request.data)
        if data is None:
            return self.bad_request(
                {"message": "scholis_test_id is required, and column_id must exist."}
            )
        try:
            binding = link_paper(
                scholis_test_id=data["scholis_test_id"],
                column=data["column"],
                course=data["course"],
                title=data.get("title"),
                linked_by=acting_user(request),
            )
        except ScholisError as e:
            return self.bad_request({"message": e.message})
        return self.created(serializers.paper_link(binding.link))


class ScholisLaunchView(RBACView):
    """
    POST — mint a one-time link admitting one student to a paper.

    ``quiz.author``, the permission the rest of assessment administration uses.
    The URL comes back in the response and is not stored: it is a bearer
    credential for an exam, and a database full of them is a database full of
    ways to sit somebody else's paper.
    """

    authentication_classes = _AUTH
    required_permissions = {"POST": "quiz.author"}

    def post(self, request):
        from app_scholis.launch import mint_student_ticket

        student = serializers.resolve_student(request.data.get("student_id"))
        if student is None:
            return self.bad_request({"message": "A valid student_id is required."})

        link = None
        paper_link_id = request.data.get("paper_link_id")
        if paper_link_id:
            link = ScholisPaperLink.objects.filter(pk=paper_link_id).first()
            if link is None:
                return self.not_found("That paper link does not exist.")

        try:
            ticket = mint_student_ticket(
                student=student,
                paper_link=link,
                scholis_test_id=request.data.get("scholis_test_id"),
                created_by=acting_user(request),
            )
        except ScholisError as e:
            return self.bad_request({"message": e.message})

        return self.created(
            {
                "url": ticket.url,
                "expires_at": ticket.expires_at.isoformat()
                if ticket.expires_at
                else None,
                "taker_ref": ticket.taker_ref,
                "scholis_test_id": ticket.scholis_test_id,
            }
        )


class ScholisTeacherLinkView(RBACView):
    """
    POST — mint a Scholis sign-in link for a teacher.

    ``organization.manage``, and this one is worth justifying. The link opens a
    staff session at Scholis for whoever holds it, so minting one for another
    person is close enough to impersonation that it should not be available to
    everybody who can manage grades. It also cannot create an account: a teacher
    Scholis has never heard of comes back as a 404 and has to be invited there
    first.
    """

    authentication_classes = _AUTH
    required_permissions = {"POST": "organization.manage"}

    def post(self, request):
        from app_scholis.teacher_sso import TeacherNotAtScholis, mint_teacher_link

        teacher = serializers.resolve_teacher(
            request.data.get("teacher_id"), request.data.get("email")
        )
        if teacher is None and not (request.data.get("email") or "").strip():
            return self.bad_request(
                {"message": "Provide teacher_id or a teacher email address."}
            )

        try:
            link = mint_teacher_link(
                teacher=teacher, email=(request.data.get("email") or "").strip() or None
            )
        except TeacherNotAtScholis as e:
            # 404, not 400: the request was well formed, the teacher is absent.
            return self.not_found(e.message)
        except ScholisError as e:
            return self.bad_request({"message": e.message})

        return self.created(
            {
                "url": link.url,
                "expires_at": link.expires_at.isoformat() if link.expires_at else None,
                "email": link.email,
            }
        )


class ScholisScoreSyncView(RBACView):
    """
    POST — pull released marks now and project them into the gradebook.
    GET — the marks already stored, exact and decimal.

    A webhook triggers this automatically. The endpoint exists because a delivery
    can be missed, and "pull again" is a much better answer to a missing mark than
    "wait and see".
    """

    authentication_classes = _AUTH
    required_permissions = {
        "POST": "grade.manage",
        "GET": ["grade.manage", "grade.view_all"],
    }

    def post(self, request):
        from app_scholis.scores import pull_scores

        course_ref = request.data.get("course_ref") or None
        since = request.data.get("since") or None
        try:
            report = pull_scores(
                course_ref=str(course_ref) if course_ref else None,
                since=str(since) if since else None,
            )
        except ScholisError as e:
            return self.bad_request({"message": e.message})

        return self.ok(serializers.sync_report(report))

    def get(self, request):
        scores = ScholisScore.objects.select_related("student", "link", "link__column")

        # A course page asks for its own marks. Filtering here rather than in the
        # browser keeps the 500-row cap meaningful: without it, one busy course
        # would crowd every other course's rows out of the window and the page
        # would look like the marks were missing.
        course_ref = request.query_params.get("course_ref")
        if course_ref:
            scores = scores.filter(link__course_id=course_ref)
        paper_link_id = request.query_params.get("paper_link_id")
        if paper_link_id:
            scores = scores.filter(link_id=paper_link_id)
        student_id = request.query_params.get("student_id")
        if student_id:
            scores = scores.filter(student_id=student_id)

        return self.ok(
            [serializers.score(s) for s in scores.order_by("-released_at", "id")[:500]]
        )


class ScholisCatchUpView(RBACView):
    """
    POST — replay events this tenant missed, from Scholis's own event log.

    The recovery path for an outage, a rotated signing secret or a webhook URL
    that moved. Gated on ``organization.manage`` because it exists to fix the
    integration, not to move marks around day to day.
    """

    authentication_classes = _AUTH
    required_permissions = {"POST": "organization.manage"}

    def post(self, request):
        from app_scholis.tasks import catch_up_events

        schema = getattr(db_connection, "schema_name", "") or getattr(
            getattr(db_connection, "tenant", None), "schema_name", ""
        )
        if not schema:
            return self.bad_request(
                {"message": "Could not resolve the current tenant."}
            )

        # Run inline rather than queued: this is an administrator deliberately
        # asking "did we miss anything?", and an answer that arrives later by
        # celery is not an answer.
        result = catch_up_events.apply(args=[schema]).get()
        return self.ok(result)


@method_decorator(csrf_exempt, name="dispatch")
class ScholisWebhookView(APIView):
    """
    POST — Scholis's delivery endpoint. No user, no session, no CSRF.

    Authentication is the HMAC over ``"<timestamp>.<body>"``, checked against the
    signing secret of the connection the path identifies. The timestamp is inside
    the signed material, so a captured delivery cannot be replayed with a fresh
    timestamp -- and it is checked for age here as well, which is the other half of
    that defence.

    The body is read as raw bytes and never re-serialised before verification.
    Re-encoding JSON changes whitespace and key order, and every legitimate
    delivery would then fail the digest comparison.

    Answers quickly and queues the work. Scholis treats a slow receiver as a
    failing one and retries it, so doing the score pull inline would turn a busy
    release into a retry storm against exactly the endpoint that is already
    struggling.
    """

    # A plain APIView, not an RBACView: there is no user to authorise. Both
    # lists are emptied so nothing tries to authenticate a caller that has no
    # credentials, and CSRF is exempted at dispatch because the request comes from
    # Scholis's server rather than a browser -- there is no session cookie for it
    # to protect, and the HMAC is what stands in for one.
    authentication_classes: list = []
    permission_classes: list = []

    def post(self, request, schema_name: str, token: str):
        from app_scholis.webhook_handling import MalformedDelivery, handle_delivery

        # The schema name comes off the URL, so it is checked before anything
        # enters it. Without this, an unknown schema made the lookup itself fail
        # and the caller got a 500 -- which Scholis retries forever against a path
        # that can never work, and which also tells the caller that this schema is
        # different from one that exists but has no such token.
        #
        # Checked separately from the token on purpose: if the database were
        # unreachable, `schema_exists` raises and falls through to the 500 below,
        # so a real outage still earns a retry rather than being reported as a
        # refusal.
        if not schema_exists(schema_name):
            logger.warning("Scholis webhook: unknown schema %r", schema_name)
            return _reject()

        try:
            # Entered explicitly. The tenant middleware resolved this request to
            # whatever its fallback is, because Scholis sends no X-Tenant header
            # and no Origin -- and the signing secret lives in the tenant schema.
            with schema_context(schema_name):
                connection = ScholisConnection.objects.filter(
                    webhook_token=token
                ).first()
                if connection is None:
                    # Deliberately indistinguishable from a bad signature. Which
                    # connection exists is not something an unauthenticated caller
                    # should be able to probe for.
                    logger.warning(
                        "Scholis webhook: unknown token for schema %s", schema_name
                    )
                    return _reject()

                secret = connection.webhook_signing_secret
                try:
                    verify_signature(
                        secret,
                        timestamp_header=request.META.get(TIMESTAMP_HEADER),
                        signature_header=request.META.get(SIGNATURE_HEADER),
                        body=request.body,
                    )
                except SignatureRejected as e:
                    # The reason is logged and not returned: it would tell an
                    # attacker whether their timestamp or their digest was wrong.
                    logger.warning(
                        "Scholis webhook rejected for %s: %s",
                        connection.external_ref,
                        e.reason,
                    )
                    return _reject()

                try:
                    handled = handle_delivery(
                        connection=connection, raw_body=request.body
                    )
                except MalformedDelivery as e:
                    logger.warning(
                        "Scholis webhook malformed for %s: %s", token, e.message
                    )
                    return _json({"isError": True, "message": e.message}, 400)
        except ScholisError as e:
            return _json({"isError": True, "message": e.message}, 400)
        except Exception as e:  # noqa: BLE001 - never leak a traceback to a caller
            # A 500 makes Scholis retry, which is right for a transient failure.
            # Anything genuinely broken will retry into the same error and be
            # visible in the logs rather than silently accepted and dropped.
            logger.exception("Scholis webhook failed for %s: %s", token, e)
            return _json({"isError": True, "message": "internal_error"}, 500)

        return _json(
            {
                "isError": False,
                "message": "success",
                "data": {
                    "received": True,
                    "duplicate": handled.duplicate,
                    "action": handled.action,
                },
            },
            200,
        )


def _reject():
    """One response for every authentication failure, so none of them is a probe."""
    return _json({"isError": True, "message": "Signature verification failed."}, 403)


def _json(payload: dict, status_code: int):
    from rest_framework.response import Response

    return Response(payload, status=status_code)
