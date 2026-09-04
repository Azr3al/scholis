import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signing outbound deliveries.
 *
 * A receiver has no other way to tell a real callback from anyone who guessed
 * the URL, and these callbacks carry students' marks. Lives at `server/` root
 * because both the pump and the tests that verify a receiver would accept the
 * result need it.
 *
 * The timestamp is inside the signed material, not merely alongside it. Signing
 * the body alone would let anyone who captured one delivery replay it forever;
 * with the timestamp signed, a receiver can refuse anything too old and an
 * attacker cannot move the clock without breaking the signature.
 */

export const SIGNATURE_HEADER = 'x-scholis-signature';
export const TIMESTAMP_HEADER = 'x-scholis-timestamp';

/** `v1=<hex>`, so the scheme can change later without receivers guessing. */
export const signPayload = (secret: string, timestamp: string, body: string): string => {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `v1=${mac}`;
};

/**
 * What a receiver should do, kept here so our tests exercise the real thing
 * rather than a re-implementation that might agree with a bug.
 */
export const verifySignature = (
  secret: string,
  timestamp: string,
  body: string,
  presented: string,
): boolean => {
  const expected = Buffer.from(signPayload(secret, timestamp, body), 'utf8');
  const candidate = Buffer.from(presented, 'utf8');
  // Length first: timingSafeEqual throws on a mismatch, and the length of a
  // hex HMAC is not a secret.
  if (expected.length !== candidate.length) return false;
  return timingSafeEqual(expected, candidate);
};
