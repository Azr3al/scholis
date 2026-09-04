import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMailer } from './index';

// The factory, as opposed to provider.ts which only decides the name. What
// matters here is that provider-specific configuration is checked when the
// adapter is built — the API constructs one at startup so a missing key fails
// the deploy rather than the first teacher to sign in.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const productionResend = (overrides: Record<string, string> = {}): void => {
  const env = {
    NODE_ENV: 'production',
    MAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 'test-key',
    MAIL_FROM: 'Scholis <noreply@example.test>',
    ...overrides,
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
};

describe('createMailer', () => {
  it('refuses to build the production provider without an API key', () => {
    productionResend({ RESEND_API_KEY: '' });
    expect(() => createMailer()).toThrow(/RESEND_API_KEY/);
  });

  it('refuses to build the production provider without a from address', () => {
    productionResend({ MAIL_FROM: '' });
    expect(() => createMailer()).toThrow(/MAIL_FROM/);
  });

  it('refuses the console mailer in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MAIL_PROVIDER', 'console');
    expect(() => createMailer()).toThrow(/stdout/i);
  });

  it('builds the configured production provider and sends through it', async () => {
    productionResend();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await createMailer().send({
      to: 'teacher@example.test',
      subject: 'Your Scholis sign-in link',
      text: 'https://app.example.test/verify?token=abc',
    });

    // Proves which adapter came back, not merely that something did.
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.resend.com/emails');
  });

  it('surfaces a provider rejection rather than swallowing it', async () => {
    productionResend();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('domain not verified', { status: 403 }),
    );

    // A sign-in link that never arrived has to be loud somewhere.
    await expect(
      createMailer().send({ to: 'a@b.test', subject: 's', text: 'https://x.test' }),
    ).rejects.toThrow(/403/);
  });

  it('still hands development a console mailer that needs no configuration', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await createMailer().send({
      to: 'teacher@example.test',
      subject: 'Your Scholis sign-in link',
      text: 'https://localhost:3000/verify?token=abc',
    });

    expect(warn).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
