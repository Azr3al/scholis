// Provider is undecided. Fix the boundary now so the choice can be made later
// without touching anything that sends mail.
//
// Surface is the intersection of what every candidate can do — no templates, no
// batching. Including a capability only some have would rule the others out.
export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. Required — some clients never render the HTML part. */
  text: string;
  html?: string | undefined;
}

export interface Mailer {
  send: (message: EmailMessage) => Promise<void>;
}
