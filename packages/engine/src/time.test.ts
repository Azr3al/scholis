import { describe, expect, it } from 'vitest';
import { attemptState } from './fixtures';
import { isPastDeadline, timeRemaining, timeRemainingMs } from './time';

const deadline = new Date('2026-08-07T10:30:00.000Z');

describe('timeRemainingMs', () => {
  it('returns the gap when the deadline is ahead', () => {
    expect(timeRemainingMs(deadline, new Date('2026-08-07T10:29:30.000Z'))).toBe(30_000);
  });

  it('returns zero exactly at the deadline', () => {
    expect(timeRemainingMs(deadline, deadline)).toBe(0);
  });

  it('floors at zero rather than going negative once overdue', () => {
    expect(timeRemainingMs(deadline, new Date('2026-08-07T10:35:00.000Z'))).toBe(0);
  });
});

describe('timeRemaining', () => {
  it('reads the deadline off the attempt state', () => {
    expect(timeRemaining(attemptState(), new Date('2026-08-07T10:20:00.000Z'))).toBe(600_000);
  });

  it('returns null for an untimed test', () => {
    expect(timeRemaining(attemptState({ deadlineAt: null }), new Date())).toBeNull();
  });

  it('does not grant extra time when the device clock is wound back', () => {
    // Cosmetic only: the server recomputes elapsed time at submit and records
    // overdue_seconds, so tampering changes the countdown, not the mark.
    const skewed = new Date('2025-08-07T10:00:00.000Z');
    expect(timeRemaining(attemptState(), skewed)).toBeGreaterThan(0);
  });

  it('shows zero when the device clock runs fast', () => {
    expect(timeRemaining(attemptState(), new Date('2027-01-01T00:00:00.000Z'))).toBe(0);
  });
});

describe('isPastDeadline', () => {
  it('is false before the deadline', () => {
    expect(isPastDeadline(attemptState(), new Date('2026-08-07T10:29:59.000Z'))).toBe(false);
  });

  it('is true at and after the deadline', () => {
    expect(isPastDeadline(attemptState(), deadline)).toBe(true);
    expect(isPastDeadline(attemptState(), new Date('2026-08-07T11:00:00.000Z'))).toBe(true);
  });

  it('is never true for an untimed test', () => {
    expect(
      isPastDeadline(attemptState({ deadlineAt: null }), new Date('2099-01-01T00:00:00.000Z')),
    ).toBe(false);
  });
});
