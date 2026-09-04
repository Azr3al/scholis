/**
 * Every way a use case can refuse.
 *
 * A closed union rather than a class hierarchy: one `DomainError` type, an
 * exhaustive set of codes, and a single mapper at the HTTP edge
 * (`lib/http.ts`). A hierarchy would buy polymorphism nobody calls, and
 * `instanceof` checks across a subclass tree are exactly the ceremony
 * principle §5 warns about.
 *
 * Note there is no HTTP status here. Status is a transport concern and lives in
 * the mapper — services must stay callable by a worker or a CLI that has no
 * notion of 404.
 */
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

/**
 * `notFound` is deliberately used for "exists but you may not see it" as well as
 * "does not exist". Distinguishing them tells an unauthenticated caller which
 * test codes are real, which is a free enumeration oracle.
 */
export const notFound = (what: string): DomainError =>
  new DomainError('not_found', `${what} not found.`);

export const forbidden = (why = 'You do not have access to this.'): DomainError =>
  new DomainError('forbidden', why);

export const conflict = (why: string): DomainError => new DomainError('conflict', why);

/** The request was well-formed but the resource is in the wrong state for it. */
export const invalidState = (why: string): DomainError => new DomainError('invalid_state', why);

export const validationFailed = (why: string): DomainError =>
  new DomainError('validation_failed', why);
