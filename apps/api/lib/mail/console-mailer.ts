import type { EmailMessage, Mailer } from './mailer.types';

// Dev adapter — prints instead of sending, so magic-link sign-in works with no
// account, no API key and no network.
//
// Refuses to run in production. A console mailer silently swallowing sign-in
// links looks like everything worked.
export const createConsoleMailer = (): Mailer => ({
  send: (message: EmailMessage) => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'The console mailer cannot run in production. Configure a real mail provider.',
      );
    }

    const link = /https?:\/\/\S+/.exec(message.text)?.[0];

    console.warn(
      [
        '',
        '─'.repeat(72),
        `  EMAIL (not sent — development stub)`,
        `  To:      ${message.to}`,
        `  Subject: ${message.subject}`,
        link === undefined ? '' : `\n  Link:    ${link}`,
        '',
        message.text
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n'),
        '─'.repeat(72),
        '',
      ]
        .filter((part) => part !== '')
        .join('\n'),
    );

    return Promise.resolve();
  },
});
