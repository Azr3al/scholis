import { describe, expect, it } from 'vitest';
import { ShortGradingMode, isShortManuallyGraded, resolveShortGradingMode } from './short-grading';

describe('resolveShortGradingMode', () => {
  it('returns rubric when gradingMode is absent (legacy auto-graded questions)', () => {
    expect(resolveShortGradingMode({ caseSensitive: false })).toBe(ShortGradingMode.Rubric);
  });

  it('returns explicit manual or rubric when set', () => {
    expect(
      resolveShortGradingMode({ gradingMode: ShortGradingMode.Manual, caseSensitive: false }),
    ).toBe(ShortGradingMode.Manual);
    expect(
      resolveShortGradingMode({ gradingMode: ShortGradingMode.Rubric, caseSensitive: true }),
    ).toBe(ShortGradingMode.Rubric);
  });
});

describe('isShortManuallyGraded', () => {
  it('is true only for manual mode', () => {
    expect(isShortManuallyGraded({ gradingMode: ShortGradingMode.Manual, caseSensitive: false })).toBe(
      true,
    );
    expect(isShortManuallyGraded({ caseSensitive: false })).toBe(false);
    expect(
      isShortManuallyGraded({ gradingMode: ShortGradingMode.Rubric, caseSensitive: false }),
    ).toBe(false);
  });
});
