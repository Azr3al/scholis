import { launchTokens, type Executor, type LaunchTokenRow } from '@scholis/db';
import { and, eq, isNull } from 'drizzle-orm';

export type LaunchTokenRecord = LaunchTokenRow;

export const insertLaunchToken = async (
  db: Executor,
  values: {
    orgId: string;
    testId: string;
    token: string;
    takerRef: string;
    takerName: string;
    expiresAt: Date;
  },
): Promise<LaunchTokenRecord> => {
  const [row] = await db.insert(launchTokens).values(values).returning();
  if (row === undefined) throw new Error('Insert into launch_tokens returned no rows');
  return row;
};

/**
 * Redeem a ticket, once.
 *
 * An UPDATE ... WHERE redeemed_at IS NULL ... RETURNING, not a read followed by
 * a write. Two students opening a forwarded link at the same moment both pass a
 * read-then-check; only one can win this. Same trick `claimMutation` uses, and
 * for the same reason.
 *
 * Returns null when the ticket does not exist or has already been used, which
 * the caller reports identically — telling the difference apart would say
 * whether a token was ever real.
 */
export const claimLaunchToken = async (
  db: Executor,
  token: string,
  now: Date,
): Promise<LaunchTokenRecord | null> => {
  const [row] = await db
    .update(launchTokens)
    .set({ redeemedAt: now })
    .where(and(eq(launchTokens.token, token), isNull(launchTokens.redeemedAt)))
    .returning();
  return row ?? null;
};
