import {
  isAnswered,
  richTextToPlainText,
  type AttemptState,
  type TestPackage,
} from '@scholis/schema';

export type Issue =
  | { code: 'unanswered'; questionId: string }
  | { code: 'essay_too_short'; questionId: string; words: number; limit: number }
  | { code: 'essay_too_long'; questionId: string; words: number; limit: number };

/** Words as a human counts them: runs of non-whitespace. */
export const countWords = (text: string): number => {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
};

/**
 * Everything wrong with an attempt right now.
 *
 * Advisory, not blocking. A taker is always allowed to submit — an essay under
 * its word count is a worse outcome than an attempt that cannot be handed in at
 * all, and the alternative traps someone at 11:59 with a validation error they
 * cannot satisfy. The take UI shows these on the review screen and lets the
 * taker decide.
 */
export const validate = (pkg: TestPackage, state: AttemptState): Issue[] => {
  const issues: Issue[] = [];

  for (const question of pkg.questions) {
    const value = state.responses[question.id];

    if (value === undefined || !isAnswered(value)) {
      issues.push({ code: 'unanswered', questionId: question.id });
      continue;
    }

    if (question.type !== 'essay' || value.kind !== 'essay') continue;

    const words = countWords(richTextToPlainText(value.doc));
    const { minWords, maxWords } = question.settings;

    if (minWords !== null && words < minWords) {
      issues.push({ code: 'essay_too_short', questionId: question.id, words, limit: minWords });
    }
    if (maxWords !== null && words > maxWords) {
      issues.push({ code: 'essay_too_long', questionId: question.id, words, limit: maxWords });
    }
  }

  return issues;
};
