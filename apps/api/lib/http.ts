import { isDomainError, type DomainErrorCode } from '@/server/errors';
import { ZodError } from 'zod';

// The one place a domain failure becomes a status code.
//
// Outside server/ because status codes are transport, and services have to stay
// callable from a worker or CLI. One mapper means a new error code can't
// silently become a 500 in half the routes.
const STATUS_BY_CODE: Record<DomainErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  invalid_state: 422,
  validation_failed: 400,
};

export const toHttpResponse = (error: unknown): Response => {
  if (isDomainError(error)) {
    return Response.json(
      { error: { code: error.code, message: error.publicMessage } },
      { status: STATUS_BY_CODE[error.code] },
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: 'validation_failed', message: 'Request body was not valid.' } },
      { status: 400 },
    );
  }

  // Anything unrecognised is a bug, not a refusal. Never echo the message —
  // it routinely contains SQL, table names, or connection strings.
  console.error('Unhandled error in route handler', error);
  return Response.json(
    { error: { code: 'internal_error', message: 'Something went wrong.' } },
    { status: 500 },
  );
};

/** Wrap a route handler so every throw becomes a well-formed response. */
export const handle = async (fn: () => Promise<Response>): Promise<Response> => {
  try {
    return await fn();
  } catch (error) {
    return toHttpResponse(error);
  }
};
