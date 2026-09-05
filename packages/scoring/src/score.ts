import { clamp, round4 } from './round';
import { scoreChoice } from './score-choice';
import { scoreShort } from './score-short';
import type { QuestionScore, ScoreInput, ScoreReport } from './score.types';
import { isShortManuallyGraded } from '@scholis/schema';

// Total: unanswered, wrong response kind, and a broken answer key all score
// zero rather than throwing. A scorer that fails halfway leaves an attempt
// half-marked, which is worse than a defensible zero.
export const score = (input: ScoreInput): ScoreReport => {
  const questionScores: QuestionScore[] = input.questions.map((question) => {
    const response = input.responses[question.id];
    const maxPoints = question.points;

    switch (question.type) {
      case 'choice':
        return {
          questionId: question.id,
          awarded: scoreChoice(question, response),
          maxPoints,
          status: 'auto',
        };

      case 'short': {
        if (isShortManuallyGraded(question.settings)) {
          const mark = input.manualMarks[question.id];
          if (mark === undefined) {
            return { questionId: question.id, awarded: 0, maxPoints, status: 'pending_manual' };
          }
          return {
            questionId: question.id,
            awarded: round4(clamp(mark, maxPoints)),
            maxPoints,
            status: 'manual',
          };
        }
        return {
          questionId: question.id,
          awarded: scoreShort(question, response),
          maxPoints,
          status: 'auto',
        };
      }

      case 'essay': {
        const mark = input.manualMarks[question.id];
        // Absent is "not marked yet", which is not the same as a mark of zero.
        // The distinction gates release: a teacher must not accidentally publish
        // an unmarked essay as a zero.
        if (mark === undefined) {
          return { questionId: question.id, awarded: 0, maxPoints, status: 'pending_manual' };
        }
        return {
          questionId: question.id,
          awarded: round4(clamp(mark, maxPoints)),
          maxPoints,
          status: 'manual',
        };
      }
    }
  });

  return {
    questionScores,
    score: round4(questionScores.reduce((total, q) => total + q.awarded, 0)),
    maxScore: questionScores.reduce((total, q) => total + q.maxPoints, 0),
    requiresManualMarking: questionScores.some((q) => q.status === 'pending_manual'),
  };
};
