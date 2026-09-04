// Every way a use case can refuse.
//
// One type with a closed set of codes, mapped to status in one place
// (lib/http.ts). No hierarchy — nothing would call the polymorphism.
//
// No HTTP status here: services have to stay callable from a worker or CLI
// that has no notion of 404.
export type DomainErrorCode =
  'not_found' | 'forbidden' | 'conflict' | 'invalid_state' | 'validation_failed';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  /** Safe to show a user. Never contains ids, SQL, or internal detail. */
  readonly publicMessage: string;

  constructor(code: DomainErrorCode, publicMessage: string, detail?: string) {
    super(detail ?? publicMessage);
    this.name = 'DomainError';
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

export const isDomainError = (error: unknown): error is DomainError => error instanceof DomainError;

// Used for "exists but you may not see it" as well as "doesn't exist".
// Distinguishing them tells a stranger which test codes are real.
export const notFound = (what: string): DomainError =>
  new DomainError('not_found', `${what} not found.`);

export const forbidden = (why = 'You do not have access to this.'): DomainError =>
  new DomainError('forbidden', why);

export const conflict = (why: string): DomainError => new DomainError('conflict', why);

/** The request was well-formed but the resource is in the wrong state for it. */
export const invalidState = (why: string): DomainError => new DomainError('invalid_state', why);

export const validationFailed = (why: string): DomainError =>
  new DomainError('validation_failed', why);
