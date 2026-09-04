import { findOrgBySlug, insertOrganization } from '@/data/organizations';
import { findUserByEmail, insertUser } from '@/data/users';
import type { PublicContext } from '@/server/context.types';
import { validationFailed } from '@/server/errors';
import { z } from 'zod';

/**
 * A teacher creating their own account, and the team that comes with it.
 *
 * Until now organisations were admin-provisioned only, which is why sign-in
 * refuses to create users. That guarantee is unchanged: signing *in* still
 * never provisions. This is a separate, deliberate door — the only place in
 * the application that may create an organisation.
 *
 * Every teacher gets an organisation of their own, because tenancy is already
 * `users.org_id` and a teacher with no org has nothing to own. That org is
 * also the team: inviting someone simply adds a user to it, so a shared quiz
 * library and multiple editors fall out of the scoping that already exists
 * rather than needing a membership model.
 */
export const signUpInput = z.object({
  name: z.string().trim().min(1).max(120),
  // Normalised in the service rather than here: chaining .toLowerCase() onto
  // z.email() silently does nothing in zod 4, which let "Ada@X" and "ada@x"
  // become two accounts. Caught by a test rather than in production.
  email: z.email(),
  /** Defaults to the person's own name — most teachers are a team of one. */
  teamName: z.string().trim().min(1).max(200).optional(),
});

export type SignUpInput = z.infer<typeof signUpInput>;

export interface SignUpResult {
  orgId: string;
  orgName: string;
  userId: string;
  email: string;
}

/** Readable, unique, and not derived from anything secret. */
const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'team';

export const signUp = async (ctx: PublicContext, input: SignUpInput): Promise<SignUpResult> => {
  // Email is globally unique, so this is the whole duplicate story. Said
  // plainly rather than as a constraint violation, and deliberately the same
  // wording whether or not the address exists is *not* a concern here: an
  // account being taken is something the person needs to be told.
  const email = input.email.trim().toLowerCase();

  const existing = await findUserByEmail(ctx.db, email);
  if (existing !== null) {
    throw validationFailed('An account already exists for that email. Sign in instead.');
  }

  const teamName = input.teamName ?? `${input.name}'s team`;

  // Slug collisions are likely — two "Oakwood School"s is not a mistake — so a
  // taken slug gets a suffix rather than an error the teacher cannot act on.
  const base = slugify(teamName);
  let slug = base;
  for (let attempt = 1; (await findOrgBySlug(ctx.db, slug)) !== null; attempt += 1) {
    slug = `${base}-${String(attempt)}`;
    if (attempt > 50) throw validationFailed('Could not create a team with that name.');
  }

  return ctx.db.transaction(async (tx) => {
    const org = await insertOrganization(tx, { name: teamName, slug });
    const user = await insertUser(tx, {
      orgId: org.id,
      email,
      name: input.name,
      // The person who created the team owns it, and can invite others.
      role: 'owner',
    });

    return { orgId: org.id, orgName: org.name, userId: user.id, email: user.email };
  });
};
