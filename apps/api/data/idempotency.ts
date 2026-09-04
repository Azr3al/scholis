import { idempotencyKeys, type Executor } from '@scholis/db';
import { and, eq } from 'drizzle-orm';

// Scoped by org as well as key. Matching on the key alone would let one
// school's retry resolve to another school's resource.
export const findIdempotentResource = async (
  db: Executor,
  key: string,
  orgId: string,
  resourceType: string,
): Promise<string | null> => {
  const [row] = await db
    .select({ resourceId: idempotencyKeys.resourceId })
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.key, key),
        eq(idempotencyKeys.orgId, orgId),
        eq(idempotencyKeys.resourceType, resourceType),
      ),
    )
    .limit(1);

  return row?.resourceId ?? null;
};

// Called inside the same transaction as the create, so key and resource either
// both exist or neither does.
//
// Throws on conflict rather than swallowing it — the loser of a race needs to
// roll back and re-read, not carry on with an orphaned resource.
export const recordIdempotentResource = async (
  db: Executor,
  args: {
    key: string;
    orgId: string;
    resourceType: string;
    resourceId: string;
    now: Date;
  },
): Promise<void> => {
  await db.insert(idempotencyKeys).values({
    key: args.key,
    orgId: args.orgId,
    resourceType: args.resourceType,
    resourceId: args.resourceId,
    createdAt: args.now,
  });
};
