import type { KeyedQuestion, ResponseValue } from '@scholis/schema';
import { richTextToPlainText } from '@scholis/schema';

type KeyedShort = Extract<KeyedQuestion, { type: 'short' }>;

// Collapses internal whitespace too, so "New  York" matches "New York". A
// double-tapped space shouldn't cost a mark.
//
// toLowerCase not localeCompare — marks shouldn't depend on server locale.
export const normalizeShortAnswer = (text: string, caseSensitive: boolean): string => {
  const collapsed = text.trim().replace(/\s+/g, ' ');
  return caseSensitive ? collapsed : collapsed.toLowerCase();
};

/** Full marks for any exact match against an accepted answer, otherwise zero. */
export const scoreShort = (question: KeyedShort, response: ResponseValue | undefined): number => {
  // Covers both "unanswered" and "wrong kind of response".
  if (response?.kind !== 'short') return 0;

  const { caseSensitive } = question.settings;
  const given = normalizeShortAnswer(richTextToPlainText(response.doc), caseSensitive);
  if (given === '') return 0;

  const matched = question.acceptedAnswers.some(
    (accepted) => normalizeShortAnswer(accepted, caseSensitive) === given,
  );

  return matched ? question.points : 0;
};
