import type { KeyedQuestion, ResponseValue } from '@scholis/schema';
<<<<<<< HEAD

type KeyedShort = Extract<KeyedQuestion, { type: 'short' }>;

/**
 * Normalise a short answer before comparison.
 *
 * Collapses internal whitespace as well as trimming the ends, so "New  York"
 * and "New York" are the same answer. A student who double-taps space should
 * not lose a mark, and a teacher should not have to key every spacing variant.
 *
 * Case folding uses `toLowerCase` rather than `localeCompare`: answers are
 * compared against a teacher's key, not sorted, and locale-aware casing would
 * make marks depend on server locale.
 */
=======
import { richTextToPlainText } from '@scholis/schema';

type KeyedShort = Extract<KeyedQuestion, { type: 'short' }>;

// Collapses internal whitespace too, so "New  York" matches "New York". A
// double-tapped space shouldn't cost a mark.
//
// toLowerCase not localeCompare — marks shouldn't depend on server locale.
>>>>>>> master
export const normalizeShortAnswer = (text: string, caseSensitive: boolean): string => {
  const collapsed = text.trim().replace(/\s+/g, ' ');
  return caseSensitive ? collapsed : collapsed.toLowerCase();
};

/** Full marks for any exact match against an accepted answer, otherwise zero. */
export const scoreShort = (question: KeyedShort, response: ResponseValue | undefined): number => {
  // Covers both "unanswered" and "wrong kind of response".
  if (response?.kind !== 'short') return 0;

  const { caseSensitive } = question.settings;
<<<<<<< HEAD
  const given = normalizeShortAnswer(response.text, caseSensitive);
=======
  const given = normalizeShortAnswer(richTextToPlainText(response.doc), caseSensitive);
>>>>>>> master
  if (given === '') return 0;

  const matched = question.acceptedAnswers.some(
    (accepted) => normalizeShortAnswer(accepted, caseSensitive) === given,
  );

  return matched ? question.points : 0;
};
