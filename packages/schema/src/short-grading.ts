import type { ShortSettings } from './question';

export enum ShortGradingMode {
  Manual = 'manual',
  Rubric = 'rubric',
}

/**
 * Effective grading mode for a short-answer question. Missing `gradingMode`
 * means rubric/auto — existing questions were auto-graded before this field
 * existed.
 */
export const resolveShortGradingMode = (settings: ShortSettings): ShortGradingMode => {
  if (settings.gradingMode !== undefined) {
    return settings.gradingMode;
  }
  return ShortGradingMode.Rubric;
};

export const isShortManuallyGraded = (settings: ShortSettings): boolean =>
  resolveShortGradingMode(settings) === ShortGradingMode.Manual;
