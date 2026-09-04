import { listReleasedAttemptsForOrg } from '@/data/attempts';
import { listKeyedQuestions } from '@/data/questions';
import { listResponsesForAttempts } from '@/data/responses';
import { listSections } from '@/data/sections';
import type { AuthedContext } from '@/server/context.types';
import { forbidden } from '@/server/errors';
import type { ScoreRow } from '@scholis/schema';
import { z } from 'zod';

/**
 * Released marks, flattened for a gradebook.
 *
 * Raw scores and maximums only. No letter grades, no percentages, no totals
 * across papers — those are school policy that changes yearly, and the calling
 * system already owns the vocabulary to express them. Scholis returning a "B"
 * would be Scholis asserting a rule it has no way to know.
 *
 * Only released attempts are visible, and that is enforced by the query rather
 * than by a filter here.
 */

export const listScoresInput = z.object({
  /** The caller's own course id, as stored on the paper. */
  courseRef: z.string().trim().min(1).max(200).optional(),
  /** Released on or after. Inclusive. */
  from: z.iso.datetime().optional(),
  /** Released on or before. Inclusive. */
  to: z.iso.datetime().optional(),
});

export type ListScoresInput = z.infer<typeof listScoresInput>;

interface Tally {
  score: number;
  maxScore: number;
}

export const listScores = async (
  ctx: AuthedContext,
  input: ListScoresInput,
): Promise<ScoreRow[]> => {
  if (!ctx.actor.scopes.includes('results:read')) {
    throw forbidden('This key cannot read results.');
  }

  const released = await listReleasedAttemptsForOrg(ctx.db, {
    orgId: ctx.actor.orgId,
    ...(input.courseRef === undefined ? {} : { courseRef: input.courseRef }),
    ...(input.from === undefined ? {} : { from: new Date(input.from) }),
    ...(input.to === undefined ? {} : { to: new Date(input.to) }),
  });
  if (released.length === 0) return [];

  // Batched by test rather than by attempt. A class sitting one paper is one
  // question read and one response read, not sixty.
  const testIds = [...new Set(released.map((row) => row.testId))];
  const perTest = new Map(
    await Promise.all(
      testIds.map(
        async (testId) =>
          [
            testId,
            {
              questions: await listKeyedQuestions(ctx.db, testId),
              sections: await listSections(ctx.db, testId),
            },
          ] as const,
      ),
    ),
  );

  const responses = await listResponsesForAttempts(
    ctx.db,
    released.map((row) => row.attempt.id),
  );
  const byAttempt = new Map<string, typeof responses>();
  for (const response of responses) {
    const existing = byAttempt.get(response.attemptId);
    if (existing === undefined) byAttempt.set(response.attemptId, [response]);
    else existing.push(response);
  }

  return released.flatMap((row) => {
    const test = perTest.get(row.testId);
    const { attempt } = row;

    // Both are stamped at release. An attempt without them is a row the
    // release path could not have produced, so it is skipped rather than
    // reported as a zero — a spurious zero in a report card is worse than a
    // missing row, which a teacher will notice and ask about.
    if (test === undefined || attempt.submittedAt === null || attempt.releasedAt === null) {
      return [];
    }

    const answered = new Map(
      (byAttempt.get(attempt.id) ?? []).map((response) => [response.questionId, response]),
    );

    // Marks per section, which is what a gradebook column made of two skills —
    // "Reading and Use of English" — is actually built from. Questions in no
    // section are tallied under a null id rather than dropped.
    const tallies = new Map<string | null, Tally>();
    for (const question of test.questions) {
      const key = question.sectionId ?? null;
      const tally = tallies.get(key) ?? { score: 0, maxScore: 0 };
      tally.maxScore += question.points;
      tally.score += answered.get(question.id)?.score ?? 0;
      tallies.set(key, tally);
    }

    const titles = new Map(test.sections.map((section) => [section.id, section.title]));

    return [
      {
        testId: row.testId,
        testTitle: row.testTitle,
        courseRef: row.courseRef,
        attemptId: attempt.id,
        studentRef: attempt.takerRef,
        takerName: attempt.takerName,
        score: attempt.score ?? 0,
        maxScore: attempt.maxScore ?? 0,
        submittedAt: attempt.submittedAt.toISOString(),
        releasedAt: attempt.releasedAt.toISOString(),
        sections: [...tallies.entries()].map(([sectionId, tally]) => ({
          sectionId,
          title:
            sectionId === null
              ? 'Ungrouped'
              : (titles.get(sectionId) ?? 'Untitled section') || 'Untitled section',
          score: tally.score,
          maxScore: tally.maxScore,
        })),
      },
    ];
  });
};
