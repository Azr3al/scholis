import { describe, expect, it } from 'vitest';
import { assertAttemptToken, issueAttemptToken, verifyAttemptToken } from './attempt-token';

const SECRET = 'secret-one';
const ATTEMPT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-08-07T10:00:00.000Z');
const EXPIRES = new Date('2026-08-07T12:00:00.000Z').getTime();

const token = (secret = SECRET, attemptId = ATTEMPT, expiresAt = EXPIRES) =>
  issueAttemptToken(secret, { attemptId, expiresAt });

describe('attempt tokens', () => {
  it('verifies a token it issued', () => {
    const result = verifyAttemptToken(SECRET, token(), ATTEMPT, NOW);
    expect(result).toEqual({ ok: true, claims: { attemptId: ATTEMPT, expiresAt: EXPIRES } });
  });

  it('rejects a token signed with a different secret', () => {
    expect(verifyAttemptToken(SECRET, token('secret-two'), ATTEMPT, NOW)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects a valid token presented on a different attempt', () => {
    // The failure this prevents: verifying a signature without checking what it
    // authorises, so a token for one attempt works on someone else's.
    expect(verifyAttemptToken(SECRET, token(), OTHER, NOW)).toEqual({
      ok: false,
      reason: 'wrong_attempt',
    });
  });

  it('rejects a token past its expiry', () => {
    const late = new Date('2026-08-07T12:00:00.001Z');
    expect(verifyAttemptToken(SECRET, token(), ATTEMPT, late)).toMatchObject({
      ok: false,
      reason: 'expired',
    });
  });

  it('accepts a token exactly at its expiry', () => {
    expect(verifyAttemptToken(SECRET, token(), ATTEMPT, new Date(EXPIRES))).toMatchObject({
      ok: true,
    });
  });

  it('rejects a tampered attempt id even when the rest is intact', () => {
    const parts = token().split('.');
    const forged = [OTHER, parts[1], parts[2]].join('.');
    expect(verifyAttemptToken(SECRET, forged, OTHER, NOW)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects an extended expiry', () => {
    // The obvious attack: keep the signature, push the deadline out.
    const parts = token().split('.');
    const forged = [parts[0], String(EXPIRES + 86_400_000), parts[2]].join('.');
    expect(verifyAttemptToken(SECRET, forged, ATTEMPT, NOW)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it.each([
    ['empty', ''],
    ['too few parts', 'a.b'],
    ['too many parts', 'a.b.c.d'],
    ['non-numeric expiry', `${ATTEMPT}.not-a-number.sig`],
    ['empty attempt id', `.${String(EXPIRES)}.sig`],
  ])('rejects a malformed token: %s', (_label, raw) => {
    expect(verifyAttemptToken(SECRET, raw, ATTEMPT, NOW)).toMatchObject({ ok: false });
  });
});

describe('assertAttemptToken', () => {
  it('returns quietly for a valid token', () => {
    expect(() => {
      assertAttemptToken(SECRET, token(), ATTEMPT, NOW);
    }).not.toThrow();
  });

  it('throws forbidden with a distinct message when expired', () => {
    const late = new Date('2026-08-08T00:00:00.000Z');
    expect(() => {
      assertAttemptToken(SECRET, token(), ATTEMPT, late);
    }).toThrow(/expired/i);
  });

  it('gives the same message for a forged token as for one aimed elsewhere', () => {
    // Distinguishing them would tell a caller whether an attempt id is real.
    const forged = (): string => {
      try {
        assertAttemptToken(SECRET, token('wrong-secret'), ATTEMPT, NOW);
        return 'no throw';
      } catch (error) {
        return (error as Error).message;
      }
    };
    const misaimed = (): string => {
      try {
        assertAttemptToken(SECRET, token(), OTHER, NOW);
        return 'no throw';
      } catch (error) {
        return (error as Error).message;
      }
    };

    expect(forged()).toBe(misaimed());
  });
});
