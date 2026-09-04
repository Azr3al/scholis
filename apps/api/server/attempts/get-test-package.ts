import { listKeyedQuestions } from '@/data/questions';
import { listSections } from '@/data/sections';
import { findTestByCode } from '@/data/tests';
import type { PublicContext } from '@/server/context.types';
import { invalidState, notFound } from '@/server/errors';
import { testPackageSchema, type TestPackage } from '@scholis/schema';
import { z } from 'zod';

export const getTestPackageInput = z.object({ code: z.string().trim().min(1).max(32) });
export type GetTestPackageInput = z.infer<typeof getTestPackageInput>;

// The key-stripping boundary.
//
// listKeyedQuestions returns questions *with* isCorrect and acceptedAnswers;
// testPackageSchema.parse drops anything the public schema doesn't declare, at
// any depth. No hand-written omit to drift as fields get added.
//
// A spec asserts the serialised payload has no keys. If it fails, every exam
// run on Scholis is void.
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

  const [questions, sections] = await Promise.all([
    listKeyedQuestions(ctx.db, test.id),
    listSections(ctx.db, test.id),
  ]);

  return testPackageSchema.parse({
    testId: test.id,
    code: test.code,
    title: test.title,
    timeLimitMinutes: test.timeLimitMinutes,
    allowNavigation: test.allowNavigation,
    testTakingMode: test.testTakingMode,
    introBody: test.introBody,
    outroBody: test.outroBody,
    // Headings only. Order still comes from each question's position.
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description ?? null,
      position: section.position,
    })),
    questions,
  });
};
