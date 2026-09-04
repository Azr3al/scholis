import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Minting and checking machine credentials.
 *
 * Lives at `server/` root rather than under a use-case folder: both the service
 * that issues keys and the one that authenticates them need it, and
 * `no-service-to-service` matches two-level paths, so shared helpers sit one
 * level up. Same reason `attempt-token.ts` is here.
 *
 * A credential is two halves joined by a dot:
 *
 *     sch_live_<keyId>.<secret>
 *
 * The prefix is not decoration. Secret scanners — GitHub's included — match on
 * known prefixes, and this project has already had credentials committed once.
 * A key that announces itself is a key that gets caught before it is abused.
 */

const PREFIX = 'sch_live_';
const SEPARATOR = '.';

export interface MintedCredential {
  /** Public half. Stored, indexed, and safe to show in a dashboard. */
  keyId: string;
  /** Hash of the secret half. The secret itself is never stored. */
  secretHash: string;
  /** The whole thing, shown once and never retrievable. */
  token: string;
}

/**
 * SHA-256, not argon2 or bcrypt, and that is deliberate.
 *
 * Slow hashes exist to make brute force expensive against low-entropy human
 * passwords. This hashes 32 bytes of randomness — there is nothing to guess —
 * and a deliberately slow hash on every API request would be self-inflicted
 * latency bought for no security at all.
 */
const hash = (secret: string): string => createHash('sha256').update(secret).digest('hex');

/**
 * A fresh secret for a key id that already exists.
 *
 * Rotation adds a secret to a client rather than replacing the client, so the
 * public half has to stay put — callers keep quoting the same key id while the
 * secret behind it changes.
 */
export const mintSecretFor = (keyId: string): Omit<MintedCredential, 'keyId'> => {
  // 32 bytes because this is the only thing standing between a caller and a
  // school's data.
  const secret = randomBytes(32).toString('base64url');
  return {
    secretHash: hash(secret),
    token: `${PREFIX}${keyId}${SEPARATOR}${secret}`,
  };
};

export const mintCredential = (): MintedCredential => {
  // Short, because the key id is an index rather than a secret.
  const keyId = randomBytes(9).toString('base64url');
  return { keyId, ...mintSecretFor(keyId) };
};

export interface ParsedCredential {
  keyId: string;
  secret: string;
}

/**
 * Split a presented token without touching the database.
 *
 * Returns null for anything malformed, which is every request carrying a
 * bearer token meant for something else. Cheap rejection before a query.
 */
export const parseCredential = (token: string): ParsedCredential | null => {
  if (!token.startsWith(PREFIX)) return null;

  const body = token.slice(PREFIX.length);
  const separator = body.indexOf(SEPARATOR);
  if (separator <= 0) return null;

  const keyId = body.slice(0, separator);
  const secret = body.slice(separator + 1);
  if (keyId === '' || secret === '') return null;

  return { keyId, secret };
};

/**
 * Constant-time comparison of a presented secret against a stored hash.
 *
 * The length check comes first because `timingSafeEqual` throws on mismatched
 * lengths — and the length of a hex SHA-256 is not a secret, so comparing it
 * openly gives nothing away.
 */
export const secretMatches = (secret: string, storedHash: string): boolean => {
  const candidate = Buffer.from(hash(secret), 'utf8');
  const stored = Buffer.from(storedHash, 'utf8');
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
};
