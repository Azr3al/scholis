import type { TestRecord } from '@/data/tests';
import type { QuestionInput } from '@/server/question-input';
import {
  authoredQuestionSchema,
  testSummarySchema,
  type AuthoredQuestion,
  type TestSummary,
} from '@scholis/contracts';

// Row → DTO mappers shared by the services.
//
// Lives one level up, alongside errors.ts and context.types.ts, so services can
// import it without tripping no-service-to-service. It's infrastructure, not a
// use case.
//
// parse() rather than a cast: anything the row carries that the contract
// doesn't declare gets stripped, so org_id and lti_context_id can't ride along.
export const toTestSummary = (row: TestRecord, questionCount: number): TestSummary =>
  testSummarySchema.parse({
    id: row.id,
    title: row.title,
    status: row.status,
    code: row.code,
    timeLimitMinutes: row.timeLimitMinutes,
    allowNavigation: row.allowNavigation,
    testTakingMode: row.testTakingMode,
    maxAttempts: row.maxAttempts,
    questionCount,
    updatedAt: row.updatedAt.toISOString(),
    tags: [],
  });

/**
 * Built from the write plus its input rather than a second read, so an
 * optimistic UI can render the saved question without a round trip.
 *
 * `options` comes from the caller because only it knows the real ids — inserted
 * rows on add, re-inserted rows on edit.
 */
export const toAuthoredQuestion = (
  id: string,
  position: number,
  q: QuestionInput,
  options: { id: string; body: unknown; isCorrect: boolean }[],
  // Threaded through so an edit keeps the heading the question was already
  // under — rewriting a body should not silently pull it out of its section.
  sectionId: string | null = null,
): AuthoredQuestion => {
  const base = { id, body: q.body, points: q.points, position, sectionId };

  switch (q.type) {
    case 'choice':
      return authoredQuestionSchema.parse({
        ...base,
        type: 'choice',
        settings: q.settings,
        options,
      });
    case 'short':
      return authoredQuestionSchema.parse({
        ...base,
        type: 'short',
        settings: q.settings,
        acceptedAnswers: q.acceptedAnswers,
      });
    case 'essay':
      return authoredQuestionSchema.parse({ ...base, type: 'essay', settings: q.settings });
  }
};
