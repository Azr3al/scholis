/**
 * Flag parsing for the provision script, kept apart from it so it can be
 * tested. The script itself connects to a database the moment it is imported,
 * which made the parser untestable — and an untested parser is how the
 * documented invocation below shipped broken.
 */

export interface ProvisionArgs {
  name: string;
  slug: string;
  email: string;
  owner: string;
}

const REQUIRED = ['name', 'slug', 'email', 'owner'] as const;

export const USAGE =
  'Usage: provision --name "School" --slug school --email head@school.test --owner "Name"';

/**
 * Reads `--flag value` pairs out of a process argv slice.
 *
 * Tokens are scanned rather than consumed in fixed pairs of two. That matters
 * because the command in the README reaches the script as
 *
 *   pnpm --filter @scholis/api provision -- --name "Oakwood School" …
 *
 * and pnpm forwards its own `--` separator, so argv begins with a bare `--`.
 * Pairing from index zero treated that separator as a flag name, took `--name`
 * as its value, and then skipped the real value — every subsequent pair landed
 * one token out. The script reported "Missing required flags: --name, --slug,
 * --email, --owner" for a command line that plainly carried all four, so
 * provisioning a school by the documented route could never succeed.
 */
export const parseProvisionArgs = (argv: string[]): ProvisionArgs => {
  const values = new Map<string, string>();

  let i = 0;
  while (i < argv.length) {
    const flag = argv[i];
    // Anything that is not a flag — including a bare `--` separator — is
    // stepped over without disturbing the pairing of what follows it.
    if (flag === undefined || flag === '--' || !flag.startsWith('--')) {
      i += 1;
      continue;
    }

    const value = argv[i + 1];
    if (value === undefined) {
      i += 1;
      continue;
    }

    values.set(flag.slice(2), value);
    i += 2;
  }

  const missing = REQUIRED.filter((key) => values.get(key) === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Missing required flags: ${missing.map((m) => `--${m}`).join(', ')}\n\n${USAGE}`,
    );
  }

  return {
    name: values.get('name') ?? '',
    slug: values.get('slug') ?? '',
    // Lower-cased here rather than at the insert: the users table matches on
    // email, and an address stored with capitals would never be found by the
    // sign-in path that normalises before looking it up.
    email: (values.get('email') ?? '').trim().toLowerCase(),
    owner: values.get('owner') ?? '',
  };
};
