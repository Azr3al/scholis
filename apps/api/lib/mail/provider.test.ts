import { describe, expect, it } from 'vitest';
import { resolveMailProvider } from './provider';

/**
 * The rule that stops production sign-in from silently breaking. The console
 * mailer writes magic links to stdout — in production that means every teacher
 * gets nothing and no error is raised anywhere.
 */
describe('resolveMailProvider', () => {
  it('defaults to console in development, so a fresh clone just works', () => {
    expect(resolveMailProvider({ NODE_ENV: 'development' })).toBe('console');
    expect(resolveMailProvider({})).toBe('console');
  });

  it('refuses to start in production without a provider', () => {
    expect(() => resolveMailProvider({ NODE_ENV: 'production' })).toThrow(/must be set/i);
  });

  it('refuses the console mailer in production even when asked for explicitly', () => {
    expect(() => resolveMailProvider({ NODE_ENV: 'production', MAIL_PROVIDER: 'console' })).toThrow(
      /stdout/i,
    );
  });

  it('treats blank as unset rather than as a provider name', () => {
    // A Railway variable set to an empty string is a normal kind of mistake,
    // and it must not read as "console is fine".
    expect(() => resolveMailProvider({ NODE_ENV: 'production', MAIL_PROVIDER: '   ' })).toThrow(
      /must be set/i,
    );
  });

  it('rejects an unknown provider rather than falling back', () => {
    expect(() =>
      resolveMailProvider({ NODE_ENV: 'production', MAIL_PROVIDER: 'sendgrid' }),
    ).toThrow(/Unknown MAIL_PROVIDER/);
    // Same in development: a typo should be loud wherever it happens.
    expect(() =>
      resolveMailProvider({ NODE_ENV: 'development', MAIL_PROVIDER: 'reslend' }),
    ).toThrow(/Unknown MAIL_PROVIDER/);
  });

  it('accepts resend in production', () => {
    expect(resolveMailProvider({ NODE_ENV: 'production', MAIL_PROVIDER: 'resend' })).toBe('resend');
  });

  it('allows console explicitly outside production', () => {
    expect(resolveMailProvider({ NODE_ENV: 'development', MAIL_PROVIDER: 'console' })).toBe(
      'console',
    );
  });
});
