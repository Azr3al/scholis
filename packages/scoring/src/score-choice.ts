import type { KeyedQuestion, ResponseValue } from '@scholis/schema';
import { resolveChoiceRubric } from '@scholis/schema';
import { clamp, round4 } from './round';

type KeyedChoice = Extract<KeyedQuestion, { type: 'choice' }>;

// Covers every teacher-facing template — true/false, Yes/No, scales — because
// they're all `choice` with different settings. No boolean branch anywhere.
export const scoreChoice = (question: KeyedChoice, response: ResponseValue | undefined): number => {
  // Covers both "unanswered" and "wrong kind of response".
  if (response?.kind !== 'choice') return 0;

  const selected = new Set(response.optionIds);
  const correct = new Set(question.options.filter((o) => o.isCorrect).map((o) => o.id));

  // A question with no correct option keyed is an authoring mistake. Award
  // nothing rather than dividing by zero or awarding everyone full marks.
  if (correct.size === 0) return 0;

  if (question.settings.selection === 'single') {
    // Selecting more than one on a single-select is not "partially right", it
    // is an invalid response — usually a client bug rather than a taker choice.
    if (selected.size !== 1) return 0;
    const [only] = [...selected];
    return only !== undefined && correct.has(only) ? question.points : 0;
  }

  const rubric = resolveChoiceRubric(question.settings, correct.size, question.points);

  if (rubric === null) {
    const hits = [...selected].filter((id) => correct.has(id)).length;
    return hits > 0 ? question.points : 0;
  }

  const hits = [...selected].filter((id) => correct.has(id)).length;
  const tier = rubric.find((entry) => entry.correctCount === hits);
  return tier === undefined ? 0 : round4(clamp(tier.points, question.points));
};
