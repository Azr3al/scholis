import {
  emptyRichText,
  type AttemptState,
  type PublicQuestion,
  type RichText,
  type TestPackage,
} from '@scholis/schema';

/** Test scaffolding. Excluded from coverage; see `packages/config/vitest.base.js`. */

export const richText = (text: string): RichText => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

export const choiceQuestion = (
  id: string,
  overrides: Partial<Extract<PublicQuestion, { type: 'choice' }>> = {},
): PublicQuestion => ({
  id,
  type: 'choice',
  body: emptyRichText(),
  points: 1,
  position: 0,
<<<<<<< HEAD
  settings: { selection: 'single', variant: 'plain', partialCredit: false },
=======
  settings: { selection: 'single', variant: 'plain', rubric: null, partialCredit: false },
  sectionId: null,
>>>>>>> master
  options: [
    { id: `${id}-a`, body: emptyRichText() },
    { id: `${id}-b`, body: emptyRichText() },
  ],
  ...overrides,
});

export const shortQuestion = (id: string): PublicQuestion => ({
  id,
  type: 'short',
  body: emptyRichText(),
  points: 1,
  position: 0,
<<<<<<< HEAD
=======
  sectionId: null,
>>>>>>> master
  settings: { caseSensitive: false },
});

export const essayQuestion = (
  id: string,
  settings: { minWords: number | null; maxWords: number | null } = {
    minWords: null,
    maxWords: null,
  },
): PublicQuestion => ({
  id,
  type: 'essay',
  body: emptyRichText(),
  points: 5,
  position: 0,
<<<<<<< HEAD
=======
  sectionId: null,
>>>>>>> master
  settings,
});

export const testPackage = (
  questions: PublicQuestion[],
  overrides: Partial<TestPackage> = {},
): TestPackage => ({
  testId: 't1',
  code: 'SCHOL-4F2K',
  title: 'Test',
  timeLimitMinutes: 30,
  allowNavigation: true,
<<<<<<< HEAD
=======
  testTakingMode: false,
  sections: [],
>>>>>>> master
  introBody: emptyRichText(),
  outroBody: emptyRichText(),
  questions: questions.map((question, index) => ({ ...question, position: index })),
  ...overrides,
});

export const attemptState = (overrides: Partial<AttemptState> = {}): AttemptState => ({
  attemptId: 'a1',
  startedAt: '2026-08-07T10:00:00.000Z',
  deadlineAt: '2026-08-07T10:30:00.000Z',
  cursor: 0,
  responses: {},
  markedForReview: [],
  submittedAt: null,
  clientSeq: 0,
  ...overrides,
});

export const ctx = (iso = '2026-08-07T10:05:00.000Z', mutationId = MUTATION_ID) => ({
  now: new Date(iso),
  mutationId,
});

export const MUTATION_ID = '00000000-0000-4000-8000-000000000001';
