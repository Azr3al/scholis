import { findUserByEmail } from '@/data/users';
import type { PublicContext } from '@/server/context.types';
import { conflict } from '@/server/errors';
import { organizations, users } from '@scholis/db';
import { z } from 'zod';

export const provisionOrgInput = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  email: z.email(),
  owner: z.string().min(1),
});
export type ProvisionOrgInput = z.infer<typeof provisionOrgInput>;

// Dev/e2e scaffolding for what the provisioning script does at the CLI. Exists
// as a service so the dev routes don't reach into the database directly —
// no-db-in-http applies to them too.
export const provisionOrg = async (
  ctx: PublicContext,
  input: ProvisionOrgInput,
): Promise<{ orgId: string }> => {
  const email = input.email.toLowerCase();
  if ((await findUserByEmail(ctx.db, email)) !== null) {
    throw conflict('That address already belongs to someone.');
  }

  return ctx.db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ name: input.name, slug: input.slug })
      .returning();
    if (org === undefined) throw new Error('Failed to create the organisation.');

    await tx.insert(users).values({
      orgId: org.id,
      email,
      name: input.owner,
      role: 'owner',
      emailVerified: true,
    });

    return { orgId: org.id };
  });
};

export const isProvisioned = async (ctx: PublicContext, email: string): Promise<boolean> =>
  (await findUserByEmail(ctx.db, email.toLowerCase())) !== null;
