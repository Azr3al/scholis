import {
  isShortManuallyGraded,
  richTextToPlainText,
  type RichText,
  type ShortSettings,
} from '@scholis/schema';

export interface ReadinessIssue {
  questionId: string;
  code: string;
  message: string;
}

/**
 * Minimal shape for publish readiness — matches AuthoredQuestion fields used
 * here.
 *
 * The optional fields say `| undefined` as well as `?` because a half-built
 * question reaches this as `{ ...question, options: undefined }`, and under
 * exactOptionalPropertyTypes "may be absent" and "may be undefined" are not the
 * same permission. Readiness exists precisely to judge unfinished questions, so
 * it has to accept the shape they actually arrive in.
 */
export interface ReadinessQuestion {
  id: string;
  type: 'choice' | 'short' | 'essay';
  body: RichText;
  points: number;
  settings?: unknown;
  options?: { body: RichText; isCorrect: boolean }[] | undefined;
  acceptedAnswers?: string[] | undefined;
}

const hasPrompt = (body: RichText): boolean => richTextToPlainText(body).trim().length > 0;

const optionHasText = (body: RichText): boolean => richTextToPlainText(body).trim().length > 0;

const choiceSelection = (settings: unknown): 'single' | 'multi' | undefined => {
  if (typeof settings !== 'object' || settings === null || !('selection' in settings)) {
    return undefined;
  }
  const selection = (settings as { selection?: unknown }).selection;
  return selection === 'single' || selection === 'multi' ? selection : undefined;
};

const asShortSettings = (settings: unknown): ShortSettings => {
  if (typeof settings === 'object' && settings !== null && 'caseSensitive' in settings) {
    return settings as ShortSettings;
  }
  return { caseSensitive: false };
};

export const listQuestionReadinessIssues = (questions: ReadinessQuestion[]): ReadinessIssue[] =>
  questions.flatMap((question) => {
    const issues: ReadinessIssue[] = [];

    if (!hasPrompt(question.body)) {
      issues.push({
        questionId: question.id,
        code: 'missing_prompt',
        message: 'Enter the question text.',
      });
    }

    if (!Number.isInteger(question.points) || question.points < 1) {
      issues.push({
        questionId: question.id,
        code: 'invalid_points',
        message: 'Enter how many marks this question is worth.',
      });
    }

    if (question.type === 'choice') {
      const options = question.options ?? [];
      const filled = options.filter((option) => optionHasText(option.body));

      if (filled.length < 2) {
        issues.push({
          questionId: question.id,
          code: 'missing_options',
          message: 'Add at least two options with text.',
        });
      }

      const correct = options.filter((option) => option.isCorrect && optionHasText(option.body));
      if (filled.length >= 2 && correct.length === 0) {
        issues.push({
          questionId: question.id,
          code: 'missing_correct',
          message: 'Mark at least one option as correct.',
        });
      }

      if (
        choiceSelection(question.settings) === 'single' &&
        filled.length >= 2 &&
        correct.length !== 1
      ) {
        issues.push({
          questionId: question.id,
          code: 'single_correct',
          message: 'A single-answer question needs exactly one correct option.',
        });
      }
    }

    if (question.type === 'short') {
      if (isShortManuallyGraded(asShortSettings(question.settings))) {
        return issues;
      }

      const answers = (question.acceptedAnswers ?? []).map((a) => a.trim()).filter((a) => a !== '');
      if (answers.length === 0) {
        issues.push({
          questionId: question.id,
          code: 'missing_accepted',
          message: 'Add at least one accepted answer.',
        });
      }
    }

    return issues;
  });

export const isQuestionReady = (question: ReadinessQuestion): boolean =>
  listQuestionReadinessIssues([question]).length === 0;

export const incompleteQuestionCount = (questions: ReadinessQuestion[]): number => {
  const incompleteIds = new Set(
    listQuestionReadinessIssues(questions).map((issue) => issue.questionId),
  );
  return incompleteIds.size;
};
