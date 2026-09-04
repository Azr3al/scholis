import { createClient, organizations, users } from '@scholis/db';
import { eq } from 'drizzle-orm';

// The only thing that may create an organisation.
//
// Sign-in authenticates and never provisions, so without this nobody can get
// in — that's intended, not an oversight.
//
//   pnpm --filter @scholis/web provision -- --name "Oakwood School" \
//     --slug oakwood --email head@oakwood.test --owner "Ada Lovelace"
//
// Idempotent on slug and email. A provisioning script that can't be run twice
// gets run twice anyway, usually at the worst moment.

interface Args {
  name: string;
  slug: string;
  email: string;
  owner: string;
}

const parseArgs = (argv: string[]): Args => {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag?.startsWith('--') === true && value !== undefined) {
      values.set(flag.slice(2), value);
    }
  }

  const required = ['name', 'slug', 'email', 'owner'] as const;
  const missing = required.filter((key) => values.get(key) === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Missing required flags: ${missing.map((m) => `--${m}`).join(', ')}\n\n` +
        'Usage: provision --name "School" --slug school --email head@school.test --owner "Name"',
    );
  }

  return {
    name: values.get('name') ?? '',
    slug: values.get('slug') ?? '',
    email: (values.get('email') ?? '').toLowerCase(),
    owner: values.get('owner') ?? '',
  };
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '') throw new Error('DATABASE_URL is not set.');

  const { db, close } = createClient(url);

  try {
    await db.transaction(async (tx) => {
      const [existingOrg] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.slug, args.slug))
        .limit(1);

      const org =
        existingOrg ??
        (
          await tx.insert(organizations).values({ name: args.name, slug: args.slug }).returning()
        )[0];

      if (org === undefined) throw new Error('Failed to create the organisation.');
      console.log(
        existingOrg === undefined
          ? `Created organisation ${org.name} (${org.slug})`
          : `Organisation ${org.slug} already exists — reusing it`,
      );

      const [existingUser] = await tx
        .select()
        .from(users)
        .where(eq(users.email, args.email))
        .limit(1);

      if (existingUser !== undefined) {
        // Email is globally unique, so this address may belong to another
        // school. Refusing beats silently moving a person between tenants.
        if (existingUser.orgId !== org.id) {
          throw new Error(
            `${args.email} already belongs to a different organisation. Use another address.`,
          );
        }
        console.log(`Owner ${args.email} already exists — nothing to do`);
        return;
      }

      await tx.insert(users).values({
        orgId: org.id,
        email: args.email,
        name: args.owner,
        role: 'owner',
        // Provisioned by an administrator, so the address is trusted without a
        // round trip. The first magic link would otherwise be blocked by a
        // verification the admin has already vouched for.
        emailVerified: true,
      });

      console.log(`Created owner ${args.owner} <${args.email}>`);
      console.log('\nThey can now sign in with a magic link. No password is set.');
    });
  } finally {
    await close();
  }
};

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
