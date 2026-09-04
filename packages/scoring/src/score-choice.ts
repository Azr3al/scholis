import type { KeyedQuestion, ResponseValue } from '@scholis/schema';
<<<<<<< HEAD
=======
import { resolveChoiceRubric } from '@scholis/schema';
>>>>>>> master
import { clamp, round4 } from './round';

type KeyedChoice = Extract<KeyedQuestion, { type: 'choice' }>;

<<<<<<< HEAD
/**
 * Marks for one choice question.
 *
 * Covers every teacher-facing template — true/false, Yes/No, rating scales —
 * because they are all `choice` with different settings (DESIGN.md §4). There
 * is deliberately no `boolean` branch here; the scorer never learns the word.
 */
=======
// Covers every teacher-facing template — true/false, Yes/No, scales — because
// they're all `choice` with different settings. No boolean branch anywhere.
>>>>>>> master
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

<<<<<<< HEAD
  if (!question.settings.partialCredit) {
    const exact = selected.size === correct.size && [...selected].every((id) => correct.has(id));
    return exact ? question.points : 0;
  }

  // Partial credit: each wrong tick cancels a right one, so ticking every box
  // scores zero rather than full marks. Without the penalty, "select all that
  // apply" is trivially gamed.
  const hits = [...selected].filter((id) => correct.has(id)).length;
  const misses = selected.size - hits;
  const raw = (question.points * (hits - misses)) / correct.size;

  return round4(clamp(raw, question.points));
=======
  const rubric = resolveChoiceRubric(question.settings, correct.size, question.points);

  if (rubric === null) {
    const hits = [...selected].filter((id) => correct.has(id)).length;
    return hits > 0 ? question.points : 0;
  }

  const hits = [...selected].filter((id) => correct.has(id)).length;
  const tier = rubric.find((entry) => entry.correctCount === hits);
  return tier === undefined ? 0 : round4(clamp(tier.points, question.points));
>>>>>>> master
};
