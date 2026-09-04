import { findTestByCode, insertTest, type TestRecord } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { conflict } from '@/server/errors';
import { emptyRichText, richTextSchema } from '@scholis/schema';
import { z } from 'zod';

export const createTestInput = z.object({
  title: z.string().trim().min(1).max(200),
  timeLimitMinutes: z.number().int().positive().nullable(),
  allowNavigation: z.boolean(),
  maxAttempts: z.number().int().positive().max(20),
  introBody: richTextSchema.optional(),
  outroBody: richTextSchema.optional(),
});

export type CreateTestInput = z.infer<typeof createTestInput>;

/**
 * Characters a person can read aloud in a noisy classroom without ambiguity.
 * 0/O, 1/I/L and U are all absent — U because it is routinely misheard as "you".
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 6;

const codeFromId = (id: string): string => {
  const hex = id.replace(/[^0-9a-f]/gi, '');
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    const pair = hex.slice(i * 2, i * 2 + 2);
    const index = Number.parseInt(pair.padEnd(2, '0'), 16) % CODE_ALPHABET.length;
    out += CODE_ALPHABET[index] ?? '2';
  }
  return `SCHOL-${out}`;
};

const MAX_CODE_ATTEMPTS = 5;

/**
 * Create a draft test.
 *
 * The org comes from the actor, never from input. Organisations are
 * admin-provisioned (IMPLEMENTATION.md §9.2), so `actor.orgId` was assigned at
 * provisioning time — accepting it from the request body would let a caller
 * write into someone else's school.
 */
export const createTest = async (
  ctx: AuthedContext,
  input: CreateTestInput,
): Promise<TestRecord> => {
  // Codes are short so a teacher can read one out, which means collisions are
  // possible rather than negligible. Retry a few times; the unique index is the
  // actual guarantee, this loop just avoids surfacing a conflict for something
  // the user cannot act on.
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = codeFromId(ctx.newId());
    if ((await findTestByCode(ctx.db, code)) !== null) continue;

    return insertTest(ctx.db, {
      orgId: ctx.actor.orgId,
      createdBy: ctx.actor.userId,
      title: input.title,
      code,
      status: 'draft',
      timeLimitMinutes: input.timeLimitMinutes,
      allowNavigation: input.allowNavigation,
      maxAttempts: input.maxAttempts,
      introBody: input.introBody ?? emptyRichText(),
      outroBody: input.outroBody ?? emptyRichText(),
      createdAt: ctx.now(),
      updatedAt: ctx.now(),
    });
  }

  throw conflict('Could not allocate a unique test code. Please try again.');
};
