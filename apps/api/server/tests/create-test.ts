import { findIdempotentResource, recordIdempotentResource } from '@/data/idempotency';
import { findTestByCode, findTestById, insertTest } from '@/data/tests';
import type { AuthedContext } from '@/server/context.types';
import { conflict } from '@/server/errors';
import { toTestSummary } from '@/server/views';
import type { TestSummary } from '@scholis/contracts';
import { emptyRichText, richTextSchema } from '@scholis/schema';
import { z } from 'zod';

export const createTestInput = z.object({
  title: z.string().trim().min(1).max(200),
  timeLimitMinutes: z.number().int().positive().nullable(),
  allowNavigation: z.boolean(),
  maxAttempts: z.number().int().positive().max(20),
  introBody: richTextSchema.optional(),
  outroBody: richTextSchema.optional(),

  /** Retry with the same key returns the original test instead of a second one. */
  idempotencyKey: z.uuid().optional(),
});

export type CreateTestInput = z.infer<typeof createTestInput>;

// No 0/O, 1/I/L or U — someone reads this out in a noisy classroom, and U
// gets misheard as "you".
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
const RESOURCE_TYPE = 'test';

// Org comes from the actor, never from input. Accepting it from the body
// would let a caller write into someone else's school.
export const createTest = async (
  ctx: AuthedContext,
  input: CreateTestInput,
): Promise<TestSummary> => {
  // Codes are short so a teacher can read one out, which means collisions are
  // possible rather than negligible. Retry a few times; the unique index is the
  // actual guarantee, this loop just avoids surfacing a conflict for something
  // the user cannot act on.
  const key = input.idempotencyKey;

  // Checked before any work: a retry should cost one read, not a second test.
  if (key !== undefined) {
    const previous = await findIdempotentResource(ctx.db, key, ctx.actor.orgId, RESOURCE_TYPE);
    if (previous !== null) {
      const existing = await findTestById(ctx.db, previous);
      // A retry returns the original. It has no questions yet by definition —
      // this path only fires before anything else has happened to it.
      if (existing !== null) return toTestSummary(existing, 0);
    }
  }

  const now = ctx.now();

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = codeFromId(ctx.newId());
    if ((await findTestByCode(ctx.db, code)) !== null) continue;

    return ctx.db.transaction(async (tx) => {
      const test = await insertTest(tx, {
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
        createdAt: now,
        updatedAt: now,
      });

      // Same transaction as the insert, so the key and the test either both
      // exist or neither does. Recording it afterwards would leave a window in
      // which a retry creates the duplicate this is meant to prevent.
      if (key !== undefined) {
        await recordIdempotentResource(tx, {
          key,
          orgId: ctx.actor.orgId,
          resourceType: RESOURCE_TYPE,
          resourceId: test.id,
          now,
        });
      }

      return toTestSummary(test, 0);
    });
  }

  throw conflict('Could not allocate a unique test code. Please try again.');
};
