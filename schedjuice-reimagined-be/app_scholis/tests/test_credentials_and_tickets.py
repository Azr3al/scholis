"""
Credentials, launch tickets, and what is allowed to be stored or returned.

Every test here is about a value that must not end up somewhere it can be read:
a secret in a database column in the clear, a launch URL in an audit row, a
ciphertext on a support screen. None of these produce a visible symptom when they
go wrong -- the integration keeps working, and the exposure is discovered later,
by somebody else.
"""
from __future__ import annotations

import json
import unittest
from contextlib import ExitStack
from datetime import date, datetime, timezone
from unittest import mock
from uuid import uuid4

import requests
from cryptography.fernet import Fernet
from django.core.management import call_command
from django.db import connection as db_connection
from django.test import TestCase, override_settings
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Course
from app_rbac.seeding import seed_rbac
from app_scholis.errors import ScholisError
from app_scholis.launch import mint_student_ticket
from app_scholis.models import (
    CREDENTIAL_PREFIX,
    ScholisConnection,
    ScholisLaunch,
)
from app_scholis.provisioning import (
    ConnectionIncomplete,
    connect_tenant,
    org_client,
)
from app_scholis.serializers import connection_status
from app_scholis.teacher_sso import TeacherNotAtScholis, mint_teacher_link

KEY_ID = "abc123keyId"
SECRET = "s3cret-value-that-must-never-be-stored-in-the-clear"
FULL_TOKEN = f"{CREDENTIAL_PREFIX}{KEY_ID}.{SECRET}"
WEBHOOK_SECRET = "whsec_another_secret_value"
LAUNCH_URL = "https://scholis.test/take/one-time-bearer-token-abc123"


def _database_reachable() -> bool:
    try:
        db_connection.ensure_connection()
        return True
    except Exception:
        return False


def _response(status: int, body) -> requests.Response:
    response = requests.Response()
    response.status_code = status
    response._content = json.dumps(body).encode("utf-8")
    return response


def _transport(payload, status=200):
    """Replace the HTTP layer so nothing leaves the test."""
    target = mock.Mock(return_value=_response(status, payload))
    patcher = mock.patch("app_scholis.client.requests.request", target)
    patcher.start()
    return target, patcher


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(
    SCHOLIS_TOKEN_ENCRYPTION_KEY=Fernet.generate_key().decode(),
    SCHOLIS_API_BASE="https://scholis.test",
    SCHOLIS_PLATFORM_KEY="sch_live_platform.dummy-local-key",
    SCHOLIS_WEBHOOK_PUBLIC_BASE="https://schedjuice.test/api/v1",
)
class ScholisCredentialTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.suffix = uuid4().hex[:6]
        stack = ExitStack()
        stack.enter_context(schema_context(self.schema_name))
        self.addCleanup(stack.close)

        seed_rbac()
        self.course = Course.objects.first()
        self.teacher = User.objects.create_user(
            email=f"sch-t-{self.suffix}@example.com",
            password="x",
            name="Sch Teacher",
            phone_number="1",
            date_of_birth=date(1990, 1, 1),
            code=f"sch-t-{self.suffix}",
            roles=[User.UserRole.TEACHER],
        )
        self.student = User.objects.create_user(
            email=f"sch-s-{self.suffix}@example.com",
            password="x",
            name="Sch Student",
            phone_number="2",
            date_of_birth=date(2008, 1, 1),
            code=f"sch-s-{self.suffix}",
            roles=[User.UserRole.STUDENT],
        )
        self.connection = ScholisConnection.objects.create(
            external_ref=f"org-{self.suffix}", school_name="Test School"
        )

    def _connected(self):
        self.connection.set_api_key(key_id=KEY_ID, token=FULL_TOKEN)
        self.connection.set_webhook(
            endpoint_id=str(uuid4()), signing_secret=WEBHOOK_SECRET
        )
        self.connection.save()
        self.connection.refresh_from_db()
        return self.connection

    # -- the credential round trip -------------------------------------------

    def test_the_bearer_token_is_reassembled_exactly_as_scholis_expects(self):
        # Scholis's parseCredential (apps/api/server/api-credential.ts) rejects
        # anything that does not start with `sch_live_`, so presenting the stored
        # secret half on its own is a 401 on every org-tier call.
        self._connected()
        self.assertEqual(self.connection.api_token, FULL_TOKEN)

    def test_the_reassembled_token_is_what_goes_on_the_wire(self):
        # The round trip that actually matters: stored ciphertext in, and the
        # right Authorization header out.
        self._connected()
        transport, patcher = _transport([{"testId": str(uuid4())}])
        self.addCleanup(patcher.stop)

        org_client(self.connection).list_scores()

        header = transport.call_args.kwargs["headers"]["Authorization"]
        self.assertEqual(header, f"Bearer {FULL_TOKEN}")

    def test_a_token_without_the_prefix_is_stored_whole_and_returned_usable(self):
        # Defensive: if Scholis ever hands back something unexpected, presenting
        # what was given beats presenting half of it.
        self.connection.set_api_key(key_id="", token="some-other-shape")
        self.connection.save()
        self.connection.refresh_from_db()
        self.assertEqual(self.connection.api_token, "some-other-shape")

    def test_a_connection_without_a_key_produces_no_token(self):
        self.assertEqual(self.connection.api_token, "")
        self.assertFalse(self.connection.has_credentials)
        with self.assertRaises(ScholisError):
            org_client(self.connection)

    # -- secrets at rest -----------------------------------------------------

    def test_the_secret_is_not_stored_in_the_clear(self):
        self._connected()
        raw = ScholisConnection.objects.values_list(
            "api_key_secret_encrypted", flat=True
        ).get(pk=self.connection.pk)

        self.assertNotIn(SECRET, raw)
        self.assertNotIn(FULL_TOKEN, raw)
        self.assertTrue(raw)  # something was stored; it is just not readable

    def test_the_webhook_signing_secret_is_not_stored_in_the_clear(self):
        self._connected()
        raw = ScholisConnection.objects.values_list(
            "webhook_signing_secret_encrypted", flat=True
        ).get(pk=self.connection.pk)

        self.assertNotIn(WEBHOOK_SECRET, raw)
        self.assertEqual(self.connection.webhook_signing_secret, WEBHOOK_SECRET)

    def test_the_key_id_is_kept_in_the_clear_because_it_is_not_a_secret(self):
        # It identifies the key in Scholis's dashboard and their audit log, so
        # support needs to be able to read it without decrypting anything.
        self._connected()
        self.assertEqual(self.connection.api_key_id, KEY_ID)

    def test_two_connections_with_the_same_secret_do_not_store_the_same_ciphertext(
        self,
    ):
        # Not a requirement, but if the encryption were deterministic a matching
        # ciphertext would be enough to prove two schools share a key.
        self._connected()
        other = ScholisConnection.objects.create(
            external_ref=f"org2-{self.suffix}", school_name="Other"
        )
        other.set_api_key(key_id=KEY_ID, token=FULL_TOKEN)
        other.save()

        self.assertNotEqual(
            self.connection.api_key_secret_encrypted, other.api_key_secret_encrypted
        )
        self.assertEqual(other.api_token, FULL_TOKEN)

    # -- what may be returned to a caller ------------------------------------

    def test_the_connection_status_shows_nothing_secret(self):
        self._connected()
        payload = connection_status(self.connection)
        serialised = json.dumps(payload)

        self.assertNotIn(SECRET, serialised)
        self.assertNotIn(FULL_TOKEN, serialised)
        self.assertNotIn(WEBHOOK_SECRET, serialised)
        # Nor the ciphertext: a support screen that shows an encrypted blob
        # invites somebody to paste it into a ticket.
        self.assertNotIn(self.connection.api_key_secret_encrypted, serialised)
        self.assertNotIn(self.connection.webhook_signing_secret_encrypted, serialised)
        # The key id is fine, and is the part support actually needs.
        self.assertEqual(payload["api_key_id"], KEY_ID)
        self.assertTrue(payload["connected"])
        self.assertTrue(payload["webhook_registered"])

    # -- launch tickets ------------------------------------------------------

    def test_a_launch_url_is_returned_but_never_stored(self):
        # The URL is a bearer credential: anyone holding it sits the paper as
        # that student. It is minted, handed to the caller, and forgotten -- the
        # audit row records that a launch happened, not the credential itself.
        self._connected()
        transport, patcher = _transport(
            {
                "url": LAUNCH_URL,
                "expiresAt": "2026-09-13T12:15:00Z",
            },
            status=201,
        )
        self.addCleanup(patcher.stop)

        ticket = mint_student_ticket(student=self.student, scholis_test_id=str(uuid4()))

        self.assertEqual(ticket.url, LAUNCH_URL)
        self.assertEqual(
            ticket.expires_at, datetime(2026, 9, 13, 12, 15, tzinfo=timezone.utc)
        )

        launch = ScholisLaunch.objects.get()
        for field in launch._meta.concrete_fields:
            value = getattr(launch, field.attname)
            self.assertNotIn(LAUNCH_URL, str(value))

        # And the audit row does record what matters about it.
        self.assertEqual(launch.taker_ref, str(self.student.pk))
        self.assertEqual(launch.student_id, self.student.pk)
        self.assertEqual(launch.taker_name, "Sch Student")

    def test_the_launch_sends_the_students_own_id_as_the_taker_reference(self):
        # takerRef is what comes back on the score row, so it has to be an
        # identifier that round-trips -- not a name, which a student types.
        self._connected()
        transport, patcher = _transport({"url": LAUNCH_URL, "expiresAt": None})
        self.addCleanup(patcher.stop)

        mint_student_ticket(student=self.student, scholis_test_id=str(uuid4()))

        sent = transport.call_args.kwargs["json"]
        self.assertEqual(sent["takerRef"], str(self.student.pk))
        self.assertEqual(sent["takerName"], "Sch Student")

    def test_a_launch_without_a_student_is_refused(self):
        self._connected()
        with self.assertRaises(ScholisError):
            mint_student_ticket(student=None, scholis_test_id=str(uuid4()))

    def test_a_launch_is_refused_when_scholis_returns_no_url(self):
        self._connected()
        _unused, patcher = _transport({"expiresAt": None})
        self.addCleanup(patcher.stop)
        with self.assertRaises(ScholisError):
            mint_student_ticket(student=self.student, scholis_test_id=str(uuid4()))
        self.assertEqual(ScholisLaunch.objects.count(), 0)

    # -- teacher sign-in -----------------------------------------------------

    def test_a_teacher_scholis_does_not_know_becomes_a_plain_explanation(self):
        self._connected()
        _unused, patcher = _transport(
            {"error": {"code": "not_found", "message": "No teacher at that address."}},
            status=404,
        )
        self.addCleanup(patcher.stop)

        with self.assertRaises(TeacherNotAtScholis) as ctx:
            mint_teacher_link(teacher=self.teacher)

        # Scholis answers 404 for "no such teacher" and for "a teacher at another
        # school" alike, so this must not claim to know which happened.
        self.assertNotIn("another school", str(ctx.exception))
        self.assertIn("invite", str(ctx.exception))

    def test_a_teacher_sign_in_link_is_returned_but_not_stored(self):
        self._connected()
        _unused, patcher = _transport(
            {"url": "https://scholis.test/sso/one-time", "expiresAt": None}
        )
        self.addCleanup(patcher.stop)

        link = mint_teacher_link(teacher=self.teacher)

        self.assertEqual(link.url, "https://scholis.test/sso/one-time")
        self.assertEqual(link.email, self.teacher.email)
        # Nothing is written here: the audit of who signed in belongs to Scholis,
        # and duplicating it would only create a second copy to keep correct.
        self.assertEqual(ScholisLaunch.objects.count(), 0)

    def test_a_trailing_space_in_an_address_is_trimmed_rather_than_rejected(self):
        # Scholis's schema refuses surrounding whitespace with a 400, which reads
        # like a broken integration to somebody whose address came out of a
        # spreadsheet.
        self._connected()
        transport, patcher = _transport({"url": "https://scholis.test/sso/x"})
        self.addCleanup(patcher.stop)

        mint_teacher_link(email=f"  {self.teacher.email}  ")

        self.assertEqual(
            transport.call_args.kwargs["json"]["email"], self.teacher.email
        )

    def test_no_address_at_all_is_refused_before_any_call(self):
        self._connected()
        with self.assertRaises(ScholisError):
            mint_teacher_link(teacher=None, email="   ")

    # -- provisioning --------------------------------------------------------

    def test_connecting_twice_does_not_re_provision(self):
        # A settings screen offers "Connect" without knowing the current state,
        # so calling it again must be harmless. Re-provisioning would risk
        # discovering the key had been rotated out from under us.
        #
        # connect_tenant keys the row on the schema name -- one tenant is one
        # school is one Scholis organisation -- so this is the reference the row
        # has to carry to be the one it finds.
        self.connection.external_ref = self.schema_name
        self.connection.save()
        self._connected()
        transport, patcher = _transport({"orgId": str(uuid4()), "created": False})
        self.addCleanup(patcher.stop)

        status = connect_tenant()

        self.assertTrue(status.webhook_registered)
        transport.assert_not_called()

    def test_connecting_stores_the_key_scholis_hands_back_once(self):
        org_id = str(uuid4())
        endpoint_id = str(uuid4())
        transport, patcher = _transport(
            {
                "orgId": org_id,
                "name": "Test School",
                "created": True,
                "key": {"keyId": KEY_ID, "token": FULL_TOKEN},
            }
        )
        self.addCleanup(patcher.stop)

        # The second call registers the webhook and returns the signing secret.
        transport.side_effect = [
            _response(
                201,
                {
                    "orgId": org_id,
                    "name": "Test School",
                    "created": True,
                    "key": {"keyId": KEY_ID, "token": FULL_TOKEN},
                },
            ),
            _response(
                200,
                {
                    "id": endpoint_id,
                    "url": "https://x",
                    "signingSecret": WEBHOOK_SECRET,
                },
            ),
        ]

        status = connect_tenant()

        self.assertTrue(status.webhook_registered)
        # connect_tenant keys the row on the schema name, which is not the row
        # setUp created, so this reads back the one it actually wrote.
        connection = ScholisConnection.objects.get(external_ref=self.schema_name)
        self.assertEqual(connection.pk, status.connection.pk)
        self.assertEqual(str(connection.scholis_org_id), org_id)
        self.assertEqual(connection.api_key_id, KEY_ID)
        self.assertEqual(connection.api_token, FULL_TOKEN)
        self.assertEqual(connection.webhook_signing_secret, WEBHOOK_SECRET)
        self.assertEqual(str(connection.webhook_endpoint_id), endpoint_id)
        self.assertIsNotNone(connection.connected_at)

        # Both calls went out: one to provision, one to register the endpoint.
        self.assertEqual(transport.call_count, 2)
        self.assertEqual(
            transport.call_args_list[0].args[1],
            "https://scholis.test/api/integration/orgs",
        )
        self.assertEqual(
            transport.call_args_list[1].args[1],
            "https://scholis.test/api/integration/webhooks",
        )

        # The URL handed to Scholis names this tenant's schema, which is what
        # makes an inbound delivery routable without a tenant header.
        registered_url = transport.call_args_list[1].kwargs["json"]["url"]
        self.assertIn(self.schema_name, registered_url)
        self.assertIn(connection.webhook_token, registered_url)

    def test_an_existing_org_with_no_key_available_is_reported_not_silently_half_connected(
        self,
    ):
        # Scholis found the school but did not re-mint its secret, and this tenant
        # holds nothing. Retrying cannot produce a key, so the message says what a
        # person has to do.
        transport, patcher = _transport(
            {"orgId": str(uuid4()), "created": False, "key": None}
        )
        self.addCleanup(patcher.stop)

        with self.assertRaises(ConnectionIncomplete) as ctx:
            connect_tenant()
        self.assertIn("rotate", str(ctx.exception).lower())
        self.assertFalse(self.connection.has_credentials)
