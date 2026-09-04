import { listKeyedQuestions } from '@/data/questions';
import { findTestByCode } from '@/data/tests';
import type { PublicContext } from '@/server/context.types';
import { invalidState, notFound } from '@/server/errors';
import { testPackageSchema, type TestPackage } from '@scholis/schema';
import { z } from 'zod';

export const getTestPackageInput = z.object({ code: z.string().trim().min(1).max(32) });
export type GetTestPackageInput = z.infer<typeof getTestPackageInput>;

/**
 * The whole test as it ships to a student's device.
 *
 * **This is the key-stripping boundary.** `listKeyedQuestions` returns questions
 * *with* `isCorrect` and `acceptedAnswers`; `testPackageSchema.parse` drops
 * every property the public schema does not declare, at every nesting depth.
 *
 * That is deliberate rather than incidental: there is no hand-written `omit`
 * here that could drift from the type as fields are added. Adding a key field to
 * the keyed schema leaves the public schema untouched, so it cannot appear in
 * this output by accident (see `packages/schema/src/question.ts`).
 *
 * A spec asserts the serialised payload contains no keys. If it ever fails,
 * every exam run on Scholis is void.
 */
export const getTestPackage = async (
  ctx: PublicContext,
  input: GetTestPackageInput,
): Promise<TestPackage> => {
  const test = await findTestByCode(ctx.db, input.code.toUpperCase());

  // `notFound` for an unpublished test too, not `forbidden`. Distinguishing
  // "no such code" from "that code exists but is a draft" tells a stranger
  // which codes are real, which is a free enumeration oracle.
  if (test?.status !== 'published') throw notFound('Test');

  const now = ctx.now();
  if (test.opensAt !== null && now < test.opensAt) {
    throw invalidState('This test is not open yet.');
  }
  if (test.closesAt !== null && now > test.closesAt) {
    throw invalidState('This test has closed.');
  }

  const questions = await listKeyedQuestions(ctx.db, test.id);

  return testPackageSchema.parse({
    testId: test.id,
    code: test.code,
    title: test.title,
    timeLimitMinutes: test.timeLimitMinutes,
    allowNavigation: test.allowNavigation,
    introBody: test.introBody,
    outroBody: test.outroBody,
    questions,
  });
};
