import { api, type StartedAttempt } from '@/lib/api';

// Just enough to rejoin: who we are and what proves it. Deliberately not the
// score or status — those are the server's to state, and a stale copy here
// would eventually contradict it.
export interface AttemptHandle {
  attemptId: string;
  token: string;
  code: string;
  submitted: boolean;
  /** Student-facing question order when randomization is on. */
  questionOrder: string[] | null;
  // Timing, so the countdown survives a refresh. Facts the student can already
  // see on screen — unlike scores or marks, which stay server-side and are
  // re-fetched every time.
  startedAt: string | null;
  serverDeadlineAt: string | null;
}

// sessionStorage, not localStorage: a shared lab machine shouldn't hand the
// next student the previous one's attempt token.
const key = (code: string) => `scholis.attempt.${code.toUpperCase()}`;

const read = (code: string): AttemptHandle | null => {
  try {
    const raw = sessionStorage.getItem(key(code));
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<AttemptHandle>;
    // A half-written or older-shaped entry is worse than none — it would send
    // a request with an undefined token and read as a mysterious 403.
    if (typeof parsed.attemptId !== 'string' || typeof parsed.token !== 'string') return null;
    return {
      attemptId: parsed.attemptId,
      token: parsed.token,
      code: parsed.code ?? code,
      submitted: parsed.submitted === true,
      questionOrder: Array.isArray(parsed.questionOrder) ? parsed.questionOrder : null,
      startedAt: parsed.startedAt ?? null,
      serverDeadlineAt: parsed.serverDeadlineAt ?? null,
    };
  } catch {
    return null;
  }
};

const write = (handle: AttemptHandle): void => {
  try {
    sessionStorage.setItem(key(handle.code), JSON.stringify(handle));
  } catch {
    // Private browsing or a full quota. Not worth failing the attempt over.
  }
};

export const recallAttempt = (code: string): AttemptHandle | null => read(code);

export const forgetAttempt = (code: string): void => {
  try {
    sessionStorage.removeItem(key(code));
  } catch {
    // ignore
  }
};

/** Remember that the paper is in — so a refresh doesn't offer it again. */
export const markSubmitted = (code: string): void => {
  const handle = read(code);
  if (handle !== null) write({ ...handle, submitted: true });
};

// Concurrent starts for the same code share one request.
//
// Without this, StrictMode's double-invoked effect fires startAttempt twice:
// the first succeeds and the second is refused by maxAttempts, so the student
// is told they've already sat a test they just opened. Checking storage isn't
// enough — the first call hasn't resolved when the second begins.
const inFlight = new Map<string, Promise<AttemptHandle>>();

export const joinOrStartAttempt = async (
  code: string,
  takerName: string,
): Promise<AttemptHandle> => {
  const existing = recallAttempt(code);
  if (existing !== null) return existing;

  const k = key(code);
  const pending = inFlight.get(k);
  if (pending !== undefined) return pending;

  const promise = api
    .startAttempt({ code, takerName, takerRef: null })
    .then((started: StartedAttempt) => {
      const handle: AttemptHandle = {
        attemptId: started.id,
        token: started.token,
        code,
        submitted: false,
        questionOrder: started.questionOrder,
        startedAt: started.startedAt,
        serverDeadlineAt: started.serverDeadlineAt,
      };
      write(handle);
      return handle;
    })
    .finally(() => {
      inFlight.delete(k);
    });

  inFlight.set(k, promise);
  return promise;
};
