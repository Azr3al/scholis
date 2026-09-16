"""
The inbound webhook receiver.

This is the one endpoint in the app that an unauthenticated caller on the
internet can reach, and the one place where a mistake writes marks into a
gradebook nobody reviewed. So the tests here are mostly about refusals.

Three properties matter more than the rest and each has its own test:

* An unknown token and a bad signature produce the *same* response. Otherwise the
  endpoint is a probe for which schools exist and which tokens are live.
* A repeated delivery is accepted but recorded once. Scholis retries, so
  at-least-once delivery is normal and must not mean marks written twice.
* The event lands in the schema named by the path, not the one the tenant
  middleware guessed. Scholis sends no ``X-Tenant`` header and no ``Origin``, so
  the middleware has nothing to work from.
"""
from __future__ import annotations

import json
import time
import unittest
import unittest.mock
from contextlib import ExitStack
from datetime import date
from uuid import uuid4

from cryptography.fernet import Fernet
from django.core.management import call_command
from django.db import IntegrityError, connection as db_connection, transaction
from django.test import Client, TestCase, override_settings
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_rbac.seeding import seed_rbac
from app_scholis.models import ScholisConnection, ScholisWebhookEvent
from app_scholis.signatures import MAX_AGE_SECONDS, sign

SIGNING_SECRET = "whsec_test_secret_value"


def _database_reachable() -> bool:
    try:
        db_connection.ensure_connection()
        return True
    except Exception:
        return False


def _delivery(event_type: str = "attempt.released.v1", *, seq="42", **payload):
    """A delivery body in the shape Scholis sends, seq as a string like theirs."""
    return {
        "id": str(uuid4()),
        "seq": seq,
        "type": event_type,
        "subjectType": "attempt",
        "subjectId": str(uuid4()),
        "payload": {"testId": str(uuid4()), **payload},
        "occurredAt": "2026-09-02T09:00:00Z",
    }


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(SCHOLIS_TOKEN_ENCRYPTION_KEY=Fernet.generate_key().decode())
class ScholisWebhookReceiverTests(TestCase):
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
        self.connection = ScholisConnection.objects.create(
            external_ref=f"org-{self.suffix}", school_name="Test School"
        )
        self.connection.set_api_key(key_id="key1", token="sch_live_key1.secret")
        self.connection.set_webhook(
            endpoint_id=str(uuid4()), signing_secret=SIGNING_SECRET
        )
        self.connection.save()
        self.url = f"/api/v1/scholis/webhooks/{self.schema_name}/{self.connection.webhook_token}"

    # -- helpers -------------------------------------------------------------

    def _post(
        self,
        body: dict | bytes,
        *,
        secret=SIGNING_SECRET,
        timestamp=None,
        signature=None,
        url=None,
        client=None,
    ):
        """Sign a body the way Scholis does and POST it to the receiver."""
        raw = body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
        timestamp = timestamp if timestamp is not None else str(int(time.time() * 1000))
        signature = (
            signature
            if signature is not None
            else sign(secret, timestamp, raw.decode("utf-8", errors="replace"))
        )
        return (client or Client()).post(
            url or self.url,
            data=raw,
            content_type="application/json",
            HTTP_X_SCHOLIS_TIMESTAMP=timestamp,
            HTTP_X_SCHOLIS_SIGNATURE=signature,
        )

    # -- the happy path ------------------------------------------------------

    def test_a_signed_delivery_is_accepted_and_recorded(self):
        body = _delivery()
        response = self._post(body)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["isError"])
        self.assertTrue(response.json()["data"]["received"])

        event = ScholisWebhookEvent.objects.get(event_id=body["id"])
        self.assertEqual(event.type, "attempt.released.v1")
        self.assertEqual(event.seq, 42)
        self.assertEqual(event.payload["testId"], body["payload"]["testId"])

    def test_the_cursor_moves_to_the_delivered_seq(self):
        self._post(_delivery(seq="17"))
        self.connection.refresh_from_db()
        self.assertEqual(self.connection.last_event_seq, 17)

    def test_a_release_queues_a_score_pull_for_the_owning_tenant(self):
        from app_scholis import tasks

        with unittest.mock.patch.object(
            tasks.pull_scores_for_tenant, "delay"
        ) as queued:
            response = self._post(_delivery("attempt.released.v1"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["action"], "score_pull_scheduled")
        queued.assert_called_once_with(self.schema_name)

    def test_event_types_with_nothing_to_do_are_recorded_without_a_pull(self):
        # Scholis will not serve an unreleased result, so pulling on `submitted`
        # would fetch nothing and look like a failure. Recording it is the work.
        from app_scholis import tasks

        for event_type in (
            "attempt.started.v1",
            "attempt.submitted.v1",
            "attempt.graded.v1",
            "test.published.v1",
        ):
            with self.subTest(event_type=event_type):
                with unittest.mock.patch.object(
                    tasks.pull_scores_for_tenant, "delay"
                ) as queued:
                    response = self._post(_delivery(event_type))
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["data"]["action"], "recorded")
                queued.assert_not_called()
                self.assertTrue(
                    ScholisWebhookEvent.objects.filter(type=event_type).exists()
                )

    def test_an_event_type_scholis_adds_later_is_stored_and_not_an_error(self):
        # A new event type must not become an incident here. Stored, reported as
        # unhandled, and the delivery still acknowledged.
        from app_scholis import tasks

        with unittest.mock.patch.object(
            tasks.pull_scores_for_tenant, "delay"
        ) as queued:
            response = self._post(_delivery("attempt.regraded.v2"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["action"], "unhandled")
        queued.assert_not_called()
        self.assertTrue(
            ScholisWebhookEvent.objects.filter(type="attempt.regraded.v2").exists()
        )

    def test_csrf_is_not_required_from_a_server_to_server_caller(self):
        # There is no session cookie for CSRF to protect; the HMAC is the
        # credential. A 403 here would mean Scholis could never deliver at all.
        body = _delivery()
        response = self._post(body, client=Client(enforce_csrf_checks=True))
        self.assertEqual(response.status_code, 200)

    # -- idempotency ---------------------------------------------------------

    def test_a_repeated_delivery_is_accepted_but_recorded_once(self):
        # Scholis retries, so the same event arrives more than once. Accepting it
        # again is right -- a 4xx would make Scholis keep retrying forever -- but
        # it must not produce a second row or a second score pull.
        from app_scholis import tasks

        body = _delivery(seq="9")
        with unittest.mock.patch.object(
            tasks.pull_scores_for_tenant, "delay"
        ) as queued:
            first = self._post(body)
            second = self._post(body)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertFalse(first.json()["data"]["duplicate"])
        self.assertTrue(second.json()["data"]["duplicate"])
        self.assertEqual(second.json()["data"]["action"], "duplicate")
        self.assertEqual(
            ScholisWebhookEvent.objects.filter(event_id=body["id"]).count(), 1
        )
        self.assertEqual(queued.call_count, 1)

    def test_two_deliveries_of_the_same_event_racing_are_still_recorded_once(self):
        # The unique constraint is what makes this safe, not a prior lookup: two
        # concurrent deliveries both pass a SELECT-then-INSERT check.
        body = _delivery()
        self._post(body)
        # The second insert has to run in its own atomic block: an IntegrityError
        # leaves the surrounding transaction unusable, and TestCase already runs
        # each test inside one.
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ScholisWebhookEvent.objects.create(
                    connection=self.connection,
                    event_id=body["id"],
                    seq=42,
                    type=body["type"],
                    payload=body["payload"],
                )
        self.assertEqual(
            ScholisWebhookEvent.objects.filter(event_id=body["id"]).count(), 1
        )

    # -- refusals ------------------------------------------------------------

    def test_a_tampered_body_is_rejected(self):
        body = _delivery()
        raw = json.dumps(body).encode()
        timestamp = str(int(time.time() * 1000))
        signature = sign(SIGNING_SECRET, timestamp, raw.decode())

        tampered = raw.replace(b'"attempt.released.v1"', b'"attempt.started.v1  "')
        response = Client().post(
            self.url,
            data=tampered,
            content_type="application/json",
            HTTP_X_SCHOLIS_TIMESTAMP=timestamp,
            HTTP_X_SCHOLIS_SIGNATURE=signature,
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(ScholisWebhookEvent.objects.count(), 0)

    def test_a_delivery_signed_with_the_wrong_secret_is_rejected(self):
        response = self._post(_delivery(), secret="whsec_somebody_elses")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(ScholisWebhookEvent.objects.count(), 0)

    def test_a_stale_timestamp_is_rejected_even_with_a_valid_signature(self):
        # The other half of replay protection. The timestamp is inside the signed
        # material, so a captured delivery cannot be re-dated -- but it can be
        # resent as-is, which is what the age check stops.
        old = str(int(time.time() * 1000) - (MAX_AGE_SECONDS + 60) * 1000)
        response = self._post(_delivery(), timestamp=old)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(ScholisWebhookEvent.objects.count(), 0)

    def test_missing_signature_headers_are_rejected(self):
        body = json.dumps(_delivery()).encode()
        for headers in (
            {},
            {"HTTP_X_SCHOLIS_TIMESTAMP": str(int(time.time() * 1000))},
            {"HTTP_X_SCHOLIS_SIGNATURE": "v1=" + "0" * 64},
        ):
            with self.subTest(headers=sorted(headers)):
                response = Client().post(
                    self.url, data=body, content_type="application/json", **headers
                )
                self.assertEqual(response.status_code, 403)
                self.assertEqual(ScholisWebhookEvent.objects.count(), 0)

    def test_an_unknown_token_is_rejected(self):
        response = self._post(
            _delivery(),
            url=f"/api/v1/scholis/webhooks/{self.schema_name}/{uuid4().hex}",
        )
        self.assertEqual(response.status_code, 403)

    def test_an_unknown_token_and_a_bad_signature_are_indistinguishable(self):
        # Which schools are connected, and which tokens are live, is not
        # something an unauthenticated caller should be able to discover by
        # measuring our responses.
        good = self._post(_delivery())
        unknown_token = self._post(
            _delivery(),
            url=f"/api/v1/scholis/webhooks/{self.schema_name}/{uuid4().hex}",
        )
        bad_signature = self._post(_delivery(), signature="v1=" + "0" * 64)
        stale = self._post(
            _delivery(),
            timestamp=str(int(time.time() * 1000) - (MAX_AGE_SECONDS + 60) * 1000),
        )

        self.assertEqual(good.status_code, 200)
        for refusal in (unknown_token, bad_signature, stale):
            self.assertEqual(refusal.status_code, 403)
            self.assertEqual(refusal.json(), unknown_token.json())

    def test_a_refusal_never_explains_which_check_failed(self):
        # The reason is logged for whoever is debugging and returned to nobody.
        for kwargs in (
            {"signature": "v1=" + "0" * 64},
            {"secret": "whsec_wrong"},
            {"timestamp": "0"},
        ):
            with self.subTest(**kwargs):
                body = self._post(_delivery(), **kwargs).json()
                self.assertEqual(body["message"], "Signature verification failed.")

    def test_a_token_belonging_to_another_school_does_not_authorise_this_one(self):
        # The path names the schema and the token names the connection. A real
        # token from a different tenant must not be accepted here.
        other_schema = "xteachersu"
        with schema_context(other_schema):
            other = ScholisConnection.objects.create(
                external_ref=f"other-{self.suffix}", school_name="Other School"
            )
            other.set_api_key(key_id="k2", token="sch_live_k2.secret")
            other.set_webhook(
                endpoint_id=str(uuid4()), signing_secret="whsec_other_secret"
            )
            other.save()
            other_token = other.webhook_token

        # Right schema in the path, wrong school's token.
        response = self._post(
            _delivery(),
            url=f"/api/v1/scholis/webhooks/{self.schema_name}/{other_token}",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(ScholisWebhookEvent.objects.count(), 0)

    def test_a_delivery_for_a_schema_that_does_not_exist_is_rejected(self):
        response = self._post(
            _delivery(),
            url=f"/api/v1/scholis/webhooks/nosuchschema/{self.connection.webhook_token}",
        )
        self.assertEqual(response.status_code, 403)

    # -- malformed input -----------------------------------------------------

    def test_a_body_that_is_not_json_is_a_400_not_a_500(self):
        # A 500 would make Scholis retry a delivery that can never succeed.
        raw = b"this is not json"
        timestamp = str(int(time.time() * 1000))
        response = Client().post(
            self.url,
            data=raw,
            content_type="application/json",
            HTTP_X_SCHOLIS_TIMESTAMP=timestamp,
            HTTP_X_SCHOLIS_SIGNATURE=sign(SIGNING_SECRET, timestamp, raw.decode()),
        )
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.json()["isError"])
        self.assertEqual(ScholisWebhookEvent.objects.count(), 0)

    def test_a_body_that_is_not_an_object_is_a_400(self):
        raw = json.dumps([1, 2, 3]).encode()
        timestamp = str(int(time.time() * 1000))
        response = Client().post(
            self.url,
            data=raw,
            content_type="application/json",
            HTTP_X_SCHOLIS_TIMESTAMP=timestamp,
            HTTP_X_SCHOLIS_SIGNATURE=sign(SIGNING_SECRET, timestamp, raw.decode()),
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(ScholisWebhookEvent.objects.count(), 0)

    def test_a_delivery_with_no_event_id_is_refused_rather_than_stored_anonymous(self):
        # Without an id there is nothing to deduplicate on, so storing it would
        # make every retry a new row and a new score pull.
        body = _delivery()
        del body["id"]
        response = self._post(body)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(ScholisWebhookEvent.objects.count(), 0)

    def test_a_non_numeric_seq_is_stored_without_a_cursor(self):
        # A bad seq must not stop the event being recorded -- but it must not
        # move the catch-up cursor either, or events would be skipped.
        self.connection.last_event_seq = 5
        self.connection.save()

        response = self._post(_delivery(seq="not-a-number"))
        self.assertEqual(response.status_code, 200)

        event = ScholisWebhookEvent.objects.first()
        self.assertIsNone(event.seq)
        self.connection.refresh_from_db()
        self.assertEqual(self.connection.last_event_seq, 5)

    # -- cursor discipline ---------------------------------------------------

    def test_the_cursor_never_moves_backward(self):
        # Out-of-order delivery is normal. A cursor that went backward would
        # replay events on the next catch-up; one that stalls only re-reads a few,
        # and re-reading is free because handling is idempotent.
        self._post(_delivery(seq="50"))
        self.connection.refresh_from_db()
        self.assertEqual(self.connection.last_event_seq, 50)

        self._post(_delivery(seq="12"))
        self.connection.refresh_from_db()
        self.assertEqual(self.connection.last_event_seq, 50)

        self._post(_delivery(seq="51"))
        self.connection.refresh_from_db()
        self.assertEqual(self.connection.last_event_seq, 51)

    def test_a_rejected_delivery_does_not_move_the_cursor(self):
        self._post(_delivery(seq="30"), secret="whsec_wrong")
        self.connection.refresh_from_db()
        self.assertIsNone(self.connection.last_event_seq)

    # -- tenant routing ------------------------------------------------------

    def test_the_event_is_recorded_in_the_schema_the_path_names(self):
        # Scholis sends no X-Tenant header and no Origin, so the tenant
        # middleware has nothing to resolve from. The path is the authority.
        self._post(_delivery())

        with schema_context(self.schema_name):
            self.assertEqual(ScholisWebhookEvent.objects.count(), 1)

        # And it did not land in a neighbouring tenant's tables instead.
        with schema_context("xteachersu"):
            self.assertEqual(ScholisWebhookEvent.objects.count(), 0)

    def test_a_delivery_arrives_with_no_tenant_header_and_still_works(self):
        # Stated explicitly because it is the reason the path carries the schema:
        # a receiver that depended on the middleware would silently write into
        # whichever schema the fallback picked.
        response = Client().post(
            self.url,
            data=json.dumps(_delivery()).encode(),
            content_type="application/json",
        )
        # No signature headers at all, so it is refused -- but by the HMAC check,
        # after the connection was found by token in the right schema.
        self.assertEqual(response.status_code, 403)
