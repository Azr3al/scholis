import { createConsoleMailer } from './console-mailer';
import type { Mailer } from './mailer.types';
import { resolveMailProvider } from './provider';
import { createResendMailer } from './resend-mailer';

export type { EmailMessage, Mailer } from './mailer.types';
export { resolveMailProvider, type MailProvider } from './provider';

// Lets the e2e suite grab the sign-in link instead of scraping stdout. Only
// ever set by the dev-only routes, and cleared straight after.
let capture: ((url: string) => void) | null = null;

export const setLinkCapture = (fn: ((url: string) => void) | null): void => {
  capture = fn;
};

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

// The one place a provider is chosen. Adding SES later is one adapter file and
// one branch here — callers keep getting a Mailer and stay unaware of which.
export const createMailer = (): Mailer => {
  const onLink = capture;
  if (onLink !== null) {
    return {
      send: (message) => {
        const link = /https?:\/\/\S+/.exec(message.text)?.[0];
        if (link !== undefined) onLink(link);
        return Promise.resolve();
      },
    };
  }

  switch (resolveMailProvider(process.env)) {
    case 'resend':
      return createResendMailer({
        apiKey: required('RESEND_API_KEY'),
        from: required('MAIL_FROM'),
      });
    case 'console':
      return createConsoleMailer();
  }
};
