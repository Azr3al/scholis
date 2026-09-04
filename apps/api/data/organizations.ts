import { organizations, type Executor, type OrganizationRow } from '@scholis/db';
import { eq } from 'drizzle-orm';

export const insertOrganization = async (
  db: Executor,
  values: { name: string; slug: string; externalRef?: string | null },
): Promise<OrganizationRow> => {
  const [row] = await db.insert(organizations).values(values).returning();
  if (row === undefined) throw new Error('Insert into organizations returned no rows');
  return row;
};

export const findOrgBySlug = async (db: Executor, slug: string): Promise<OrganizationRow | null> => {
  const [row] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
  return row ?? null;
};

/** The idempotency key for provisioning: the caller's own id for this school. */
export const findOrgByExternalRef = async (
  db: Executor,
  externalRef: string,
): Promise<OrganizationRow | null> => {
  const [row] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.externalRef, externalRef))
    .limit(1);
  return row ?? null;
};
