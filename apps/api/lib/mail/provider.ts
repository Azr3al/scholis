/**
 * Which mail provider to build, decided from configuration alone.
 *
 * Split from index.ts so the rule can be tested without importing an adapter —
 * and so the rule is one readable function rather than branches scattered
 * through a factory.
 *
 * The console mailer prints the sign-in link to stdout. That is exactly right
 * in development and catastrophic in production: every magic link would go to
 * the server log instead of the teacher, and sign-in would appear broken with
 * no error anywhere. So production has to say which real provider it wants.
 */
export type MailProvider = 'console' | 'resend';

const PROVIDERS: readonly string[] = ['console', 'resend'];

export interface MailEnv {
  MAIL_PROVIDER?: string | undefined;
  NODE_ENV?: string | undefined;
}

export const resolveMailProvider = (env: MailEnv): MailProvider => {
  const production = env.NODE_ENV === 'production';
  const configured = env.MAIL_PROVIDER?.trim();

  if (configured === undefined || configured === '') {
    // Unset is a normal mistake in development and an unacceptable one in
    // production, so the two get different answers.
    if (production) {
      throw new Error(
        'MAIL_PROVIDER must be set in production. Set it to one of: ' + PROVIDERS.join(', '),
      );
    }
    return 'console';
  }

  if (!PROVIDERS.includes(configured)) {
    throw new Error(
      `Unknown MAIL_PROVIDER "${configured}". Expected one of: ${PROVIDERS.join(', ')}`,
    );
  }

  if (configured === 'console' && production) {
    throw new Error(
      'MAIL_PROVIDER=console writes sign-in links to stdout and must not be used in production.',
    );
  }

  return configured as MailProvider;
};
