import { describe, expect, it } from 'vitest';
import { USAGE, parseProvisionArgs } from './provision-args';

// argv exactly as pnpm forwards it for the command documented at the top of
// provision-org.ts. The leading '--' is pnpm's own separator, not something a
// person types.
const PNPM_ARGV = [
  '--',
  '--name',
  'Oakwood School',
  '--slug',
  'oakwood',
  '--email',
  'HEAD@Oakwood.test',
  '--owner',
  'Ada Lovelace',
];

const PLAIN_ARGV = PNPM_ARGV.slice(1);

describe('parseProvisionArgs', () => {
  it('parses the command line pnpm actually forwards, separator included', () => {
    // This is the regression. Read in fixed pairs from index zero, the bare
    // '--' became a flag name and '--name' became its value, shifting every
    // pair after it by one token. All four flags were on the command line and
    // all four were reported missing, so provisioning never worked.
    expect(parseProvisionArgs(PNPM_ARGV)).toEqual({
      name: 'Oakwood School',
      slug: 'oakwood',
      email: 'head@oakwood.test',
      owner: 'Ada Lovelace',
    });
  });

  it('parses the same flags without the separator', () => {
    // Run directly with tsx there is no '--'. Both forms must work, or the fix
    // just moves the off-by-one.
    expect(parseProvisionArgs(PLAIN_ARGV)).toEqual(parseProvisionArgs(PNPM_ARGV));
  });

  it('normalises the email the sign-in path will look it up by', () => {
    const args = parseProvisionArgs([
      '--name',
      'Oakwood',
      '--slug',
      'oakwood',
      '--email',
      '  HEAD@Oakwood.test  ',
      '--owner',
      'Ada',
    ]);

    expect(args.email).toBe('head@oakwood.test');
  });

  it('keeps a value that legitimately begins with a dash', () => {
    // A hyphenated slug or a name like "-- Anonymous --" must survive: only a
    // bare '--' separator is stepped over, never a value.
    const args = parseProvisionArgs([
      '--name',
      '-- Anonymous --',
      '--slug',
      'anon',
      '--email',
      'a@b.test',
      '--owner',
      'Nobody',
    ]);

    expect(args.name).toBe('-- Anonymous --');
    expect(args.owner).toBe('Nobody');
  });

  it('names every missing flag and prints the usage line', () => {
    expect(() => parseProvisionArgs(['--name', 'Oakwood'])).toThrowError(
      /Missing required flags: --slug, --email, --owner/,
    );
    expect(() => parseProvisionArgs([])).toThrowError(USAGE);
  });

  it('treats a flag with no value as missing rather than swallowing the next flag', () => {
    // '--owner' has no value, so '--email' must not be consumed as one.
    expect(() =>
      parseProvisionArgs(['--name', 'O', '--slug', 'o', '--email', 'a@b.test', '--owner']),
    ).toThrowError(/--owner/);
  });
});
