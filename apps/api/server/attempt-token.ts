import { forbidden } from '@/server/errors';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Proves the caller actually started this attempt.
//
// Before this, anyone with the attempt UUID could write answers or submit.
// Unguessable ids aren't authorisation — shared screens and copied links are
// a real thing in classrooms.
//
// Stateless on purpose: takers have no account and the device may be offline
// for the whole sitting, so there's nothing to look up.
//
// Lives at server/ root, not server/attempts/ — no-service-to-service matches
// two-level paths, so shared helpers have to sit one level up.

const SEPARATOR = '.';

export interface AttemptTokenClaims {
  attemptId: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

const sign = (secret: string, payload: string): string =>
  createHmac('sha256', secret).update(payload).digest('base64url');

// Don't shorten this expiry. Offline attempts can sit disconnected for hours
// and there's no refresh path for a student mid-exam.
export const issueAttemptToken = (secret: string, claims: AttemptTokenClaims): string => {
  const payload = `${claims.attemptId}${SEPARATOR}${String(claims.expiresAt)}`;
  return `${payload}${SEPARATOR}${sign(secret, payload)}`;
};

export type VerifyFailure = 'malformed' | 'bad_signature' | 'expired' | 'wrong_attempt';

export type VerifyResult =
  { ok: true; claims: AttemptTokenClaims } | { ok: false; reason: VerifyFailure };

// expectedAttemptId is required, not optional. Verifying a signature without
// checking what it authorises is how this pattern usually fails — valid token
// for attempt A, accepted on attempt B.
export const verifyAttemptToken = (
  secret: string,
  token: string,
  expectedAttemptId: string,
  now: Date,
): VerifyResult => {
  const parts = token.split(SEPARATOR);
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };

  const [attemptId, expiresRaw, signature] = parts as [string, string, string];
  const expiresAt = Number(expiresRaw);
  if (attemptId === '' || !Number.isSafeInteger(expiresAt)) {
    return { ok: false, reason: 'malformed' };
  }

  const expected = sign(secret, `${attemptId}${SEPARATOR}${String(expiresAt)}`);

  // Length check first — timingSafeEqual throws on mismatched lengths, and the
  // length of a base64url HMAC isn't a secret.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' };
  }

  // Signature checked before expiry or subject, so a forged token tells you
  // nothing about which attempt ids exist.
  if (attemptId !== expectedAttemptId) return { ok: false, reason: 'wrong_attempt' };
  if (now.getTime() > expiresAt) return { ok: false, reason: 'expired' };

  return { ok: true, claims: { attemptId, expiresAt } };
};

/** Grace beyond the deadline. Long enough for a device offline for a whole sitting. */
export const ATTEMPT_TOKEN_GRACE_MS = 6 * 60 * 60 * 1000;

/** Fallback lifetime for untimed tests, which have no deadline to extend from. */
export const ATTEMPT_TOKEN_UNTIMED_MS = 24 * 60 * 60 * 1000;

// Mapping lives here so two services can't disagree about whether an expired
// token is a 403 or a 404.
export const assertAttemptToken = (
  secret: string,
  token: string,
  attemptId: string,
  now: Date,
): void => {
  const result = verifyAttemptToken(secret, token, attemptId, now);
  if (result.ok) return;

  if (result.reason === 'expired') {
    throw forbidden('This test session has expired. Ask your teacher to reopen it.');
  }

  // One message for everything else. Saying whether the signature failed, the
  // token was malformed, or it was aimed elsewhere is free reconnaissance.
  throw forbidden('This test session is no longer valid.');
};
