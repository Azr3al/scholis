"""
Signature verification against Scholis's real algorithm.

The vectors below were produced by executing ``signPayload`` from Scholis's own
``apps/api/server/webhook-signature.ts`` -- the TypeScript, not a description of
it. They are what makes this more than a test of our code agreeing with itself:
if either side changes the signed material, the ordering, or the encoding, one of
these fails and says so.

A receiver that verifies signatures with a subtly different scheme is worse than
one that does not verify them at all. It looks defended, and every legitimate
delivery is rejected -- or worse, some are accepted.
"""
from __future__ import annotations

import time

from django.test import SimpleTestCase

from app_scholis.signatures import (
    MAX_AGE_SECONDS,
    SignatureRejected,
    sign,
    verify,
)

# (secret, timestamp, body) -> signature, from Scholis's signPayload.
VECTORS = [
    (
        "whsec_test_secret_value",
        "1789999999999",
        '{"id":"6f1e","seq":"42","type":"attempt.released.v1","payload":{"score":12.5}}',
        "v1=aeb22107c8432982575e0a8173e6c85b04f8a90460dc8c52ff1d22ecc6c690bf",
    ),
    # Empty body and a zero timestamp: the degenerate case, still signed.
    (
        "a",
        "0",
        "",
        "v1=959e4312deafb6fb1ffbaf62fab28de91c5ae671e8250048953c5e72e1dd01aa",
    ),
    # Non-ASCII and nesting. The digest is over the exact bytes, so an encoding
    # mistake anywhere shows up here.
    (
        "s3cr3t",
        "1700000000000",
        '{"nested":{"unicode":"é中文","arr":[1,2,3]}}',
        "v1=8516c08b1aa93040acc49aa40a40befcc2311d40a89ebb9a68a1729596209e88",
    ),
]


class SignatureInteropTest(SimpleTestCase):
    def test_sign_reproduces_scholis_exactly(self):
        for secret, timestamp, body, expected in VECTORS:
            with self.subTest(timestamp=timestamp):
                self.assertEqual(sign(secret, timestamp, body), expected)

    def test_verify_accepts_scholis_own_signature(self):
        for secret, timestamp, body, signature in VECTORS:
            with self.subTest(timestamp=timestamp):
                # now_ms is pinned to the vector's timestamp so the age check
                # cannot interfere with what is being tested here.
                verify(
                    secret,
                    timestamp_header=timestamp,
                    signature_header=signature,
                    body=body.encode("utf-8"),
                    now_ms=int(timestamp),
                )


class SignatureRejectionTest(SimpleTestCase):
    SECRET = "whsec_test_secret_value"

    def _fresh(self, body: str = '{"a":1}') -> tuple[str, str, bytes]:
        timestamp = str(int(time.time() * 1000))
        return timestamp, sign(self.SECRET, timestamp, body), body.encode()

    def test_tampered_body_is_rejected(self):
        timestamp, signature, body = self._fresh('{"score":12.5}')
        tampered = body.replace(b"12.5", b"99.0")
        with self.assertRaises(SignatureRejected):
            verify(
                self.SECRET,
                timestamp_header=timestamp,
                signature_header=signature,
                body=tampered,
            )

    def test_wrong_secret_is_rejected(self):
        timestamp, _signature, body = self._fresh()
        theirs = sign("somebody_elses_secret", timestamp, body.decode())
        with self.assertRaises(SignatureRejected):
            verify(
                self.SECRET,
                timestamp_header=timestamp,
                signature_header=theirs,
                body=body,
            )

    def test_stale_delivery_is_rejected_as_a_replay(self):
        # The timestamp is inside the signed material, so an attacker who captured
        # a delivery cannot move it to a fresh timestamp. What they can do is
        # resend it unchanged -- which is what the age check stops.
        old_ms = int(time.time() * 1000) - (MAX_AGE_SECONDS + 60) * 1000
        timestamp = str(old_ms)
        signature = sign(self.SECRET, timestamp, '{"a":1}')
        with self.assertRaises(SignatureRejected) as ctx:
            verify(
                self.SECRET,
                timestamp_header=timestamp,
                signature_header=signature,
                body=b'{"a":1}',
            )
        self.assertIn("old", ctx.exception.reason)

    def test_a_timestamp_too_far_in_the_future_is_also_rejected(self):
        # Symmetric on purpose: a future timestamp is as much a sign of a doctored
        # delivery as an old one, and accepting it would let a captured delivery be
        # pre-dated for later use.
        future_ms = int(time.time() * 1000) + (MAX_AGE_SECONDS + 60) * 1000
        timestamp = str(future_ms)
        signature = sign(self.SECRET, timestamp, '{"a":1}')
        with self.assertRaises(SignatureRejected):
            verify(
                self.SECRET,
                timestamp_header=timestamp,
                signature_header=signature,
                body=b'{"a":1}',
            )

    def test_missing_headers_are_rejected(self):
        _timestamp, signature, body = self._fresh()
        for kwargs in (
            {"timestamp_header": None, "signature_header": signature},
            {"timestamp_header": "", "signature_header": signature},
            {"timestamp_header": "0", "signature_header": None},
        ):
            with self.subTest(**kwargs), self.assertRaises(SignatureRejected):
                verify(self.SECRET, body=body, **kwargs)

    def test_an_unknown_signature_scheme_is_rejected(self):
        # v1 is in the header precisely so the scheme can change later. Accepting
        # an unrecognised one by falling back to v1 would make that upgrade
        # ambiguous.
        timestamp = str(int(time.time() * 1000))
        body = b'{"a":1}'
        digest = sign(self.SECRET, timestamp, body.decode()).split("=", 1)[1]
        with self.assertRaises(SignatureRejected):
            verify(
                self.SECRET,
                timestamp_header=timestamp,
                signature_header=f"v2={digest}",
                body=body,
            )

    def test_a_non_numeric_timestamp_is_rejected(self):
        with self.assertRaises(SignatureRejected):
            verify(
                self.SECRET,
                timestamp_header="not-a-number",
                signature_header="v1=" + "0" * 64,
                body=b'{"a":1}',
            )

    def test_no_secret_recorded_is_rejected(self):
        # An unconfigured connection must fail closed. Treating "no secret" as
        # "nothing to check" would accept unsigned deliveries.
        timestamp = str(int(time.time() * 1000))
        with self.assertRaises(SignatureRejected):
            verify(
                "",
                timestamp_header=timestamp,
                signature_header=sign("", timestamp, "{}"),
                body=b"{}",
            )

    def test_rejection_reasons_never_leak_the_expected_digest(self):
        timestamp, _signature, body = self._fresh()
        with self.assertRaises(SignatureRejected) as ctx:
            verify(
                self.SECRET,
                timestamp_header=timestamp,
                signature_header="v1=" + "0" * 64,
                body=body,
            )
        expected = sign(self.SECRET, timestamp, body.decode())
        self.assertNotIn(expected, ctx.exception.reason)
