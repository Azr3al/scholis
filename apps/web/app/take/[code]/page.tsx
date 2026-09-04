'use client';

import { CommentPromptModal, isCommentDismissed } from '@/components/take/comment-prompt-modal';
import { QuestionView } from '@/components/take/question-view';
import { RegisterServiceWorker } from '@/components/take/register-service-worker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, type ReleasedResult } from '@/lib/api';
import { packageForAttempt } from '@/lib/take/question-order';
import { plainText } from '@/lib/take/rich-text';
import { joinOrStartAttempt, markSubmitted, type AttemptHandle } from '@/lib/take/session';
import { loadTestPackage, saveTestPackage } from '@/lib/take/store';
import { useAttempt, type SyncStatus } from '@/lib/take/use-attempt';
import { useMonitoring } from '@/lib/take/use-monitoring';
import { useUiFeedback } from '@/lib/take/use-ui-feedback';
import { cn } from '@/lib/utils';
import type { RejectionReason } from '@scholis/engine';
import { isPastDeadline } from '@scholis/engine';
import type { RichText, TestPackage } from '@scholis/schema';
import { use, useCallback, useEffect, useRef, useState } from 'react';

interface Loaded {
  pkg: TestPackage;
  handle: AttemptHandle;
  /**
   * Where the paper came from. A locally stored package is a copy of what the
   * server said earlier, and the student is told so — it must never pass itself
   * off as a fresh read.
   */
  source: 'network' | 'local';
  savedAt: string | null;
}

export default function TakePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ name?: string }>;
}) {
  const { code } = use(params);
  const { name } = use(searchParams);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Object rather than a bare `let` — TS narrows a boolean local to `false`
    // inside the closure and the linter then calls every check redundant.
    const run = { cancelled: false };

    void (async () => {
      const takerName = name === undefined || name === '' ? 'Anonymous' : name;

      try {
        const pkg = await api.getTestPackage(code);
        // Kept for the next load, which may not have a connection. Not awaited:
        // a slow write shouldn't hold up the paper appearing.
        void saveTestPackage(code, pkg);

        const handle = await joinOrStartAttempt(code, takerName);
        const ordered = packageForAttempt(pkg, handle.questionOrder);
        if (!run.cancelled) setLoaded({ pkg: ordered, handle, source: 'network', savedAt: null });
      } catch (e) {
        // The paper couldn't be fetched. If this device already has it, and an
        // attempt was already started here, the student can carry on — that is
        // the whole point of a reload surviving a dead connection.
        //
        // joinOrStartAttempt only reaches the network when there is no attempt
        // in sessionStorage, so on a reload this resolves locally too. If it
        // does need the network, it throws and we fall through to the error.
        const cached = await loadTestPackage(code);
        if (cached !== null) {
          try {
            const handle = await joinOrStartAttempt(code, takerName);
            const ordered = packageForAttempt(cached.pkg, handle.questionOrder);
            if (!run.cancelled) {
              setLoaded({ pkg: ordered, handle, source: 'local', savedAt: cached.savedAt });
            }
            return;
          } catch {
            // No attempt on this device either — nothing to resume.
          }
        }

        if (!run.cancelled) setError(e instanceof Error ? e.message : 'Could not load this test.');
      }
    })();

    return () => {
      run.cancelled = true;
    };
  }, [code, name]);

  if (error !== null) {
    return (
      <main className="mx-auto max-w-2xl p-4 sm:p-6">
        <p className="text-destructive" data-testid="take-error">
          {error}
        </p>
      </main>
    );
  }

  if (loaded === null) {
    return (
      <main className="mx-auto max-w-2xl p-4 sm:p-6">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <>
      {/* Installed once the paper is open, which is necessarily while the
          student still has a connection. */}
      <RegisterServiceWorker />
      <Attempt {...loaded} />
    </>
  );
}

const answers = (n: number): string => `${String(n)} ${n === 1 ? 'answer' : 'answers'}`;

/**
 * The resilience story, said out loud.
 *
 * Everything reported here already happened — the outbox, the retry loop and
 * the IndexedDB snapshot all predate this component. What was missing was any
 * reason for a student to believe it. "Offline" on its own is a worry;
 * "Offline — 3 answers saved on this device" is a fact they can act on.
 */
const SaveIndicator = ({ status, pending }: { status: SyncStatus; pending: number }) => {
  const { dot, text, tone } = ((): { dot: string; text: string; tone: string } => {
    switch (status) {
      case 'saved':
        return { dot: 'bg-emerald-500', text: 'Saved', tone: 'text-muted-foreground' };
      case 'saving':
        return {
          dot: 'bg-amber-500 animate-pulse',
          text: 'Saving…',
          tone: 'text-muted-foreground',
        };
      case 'offline':
        return {
          dot: 'bg-amber-500',
          text: pending > 0 ? `Offline — ${answers(pending)} saved on this device` : 'Offline',
          tone: 'text-foreground',
        };
      case 'blocked':
        return {
          dot: 'bg-destructive',
          text: 'Not saving — tell your teacher',
          tone: 'text-destructive',
        };
    }
  })();

  return (
    <span
      className={cn(
        'transition-ui flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
        tone,
      )}
      aria-live="polite"
      data-testid="sync-status"
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', dot)} aria-hidden />
      {text}
    </span>
  );
};

// The reducer already refused the event; this is only how we say so. Silence
// was the old behaviour — past the deadline a student could type into a box
// that quietly discarded everything.
const rejectionMessage = (reason: RejectionReason): string => {
  switch (reason) {
    case 'deadline_passed':
      return "Time is up — that answer wasn't saved.";
    case 'already_submitted':
      return 'You have already handed this in.';
    case 'navigation_disabled':
      return "This test doesn't let you go back to earlier questions.";
    case 'cursor_out_of_range':
      return 'There is no question there.';
    case 'unknown_question':
      return "That question isn't part of this test.";
    case 'response_kind_mismatch':
      return "That answer doesn't fit this question.";
  }
};

// Counts down to the deadline the server set. The deadline is enforced by the
// reducer and the API — this exists so the student isn't ambushed by it.
const Countdown = ({ deadlineAt }: { deadlineAt: string }) => {
  const [remaining, setRemaining] = useState(() => Date.parse(deadlineAt) - Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(Date.parse(deadlineAt) - Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [deadlineAt]);

  const urgent = remaining < 5 * 60_000;
  const seconds = Math.max(0, Math.floor(remaining / 1000));

  return (
    <span
      // role=timer with live announcements off: a screen reader reading every
      // tick would drown out the question.
      role="timer"
      aria-live="off"
      className={urgent ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'}
      data-testid="countdown"
    >
      {remaining <= 0
        ? 'Time is up'
        : `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')} left`}
    </span>
  );
};

const Attempt = ({ pkg, handle, source, savedAt }: Loaded) => {
  const {
    state,
    status,
    syncError,
    pending,
    recovered,
    clearRecovered,
    track,
    dispatch,
    canDispatch,
    submit,
    progress,
    restored,
  } = useAttempt(pkg, handle);
  const current = pkg.questions[state.cursor];
  const testDescription = plainText(pkg.introBody).trim();

  // Looked up rather than nested: sections are labels on questions, so the
  // heading is derived from whichever question the cursor is on.
  const currentSection =
    current?.sectionId === null || current?.sectionId === undefined
      ? undefined
      : pkg.sections.find((section) => section.id === current.sectionId);
  const [handedIn, setHandedIn] = useState(
    () => handle.submitted && isCommentDismissed(handle.attemptId),
  );
  const [showCommentModal, setShowCommentModal] = useState(
    () => handle.submitted && !isCommentDismissed(handle.attemptId),
  );
  const [handingIn, setHandingIn] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [rejection, setRejection] = useState<RejectionReason | null>(null);
  const [timeUp, setTimeUp] = useState(
    () => state.deadlineAt !== null && isPastDeadline(state, new Date()),
  );
  const autoSubmitStarted = useRef(false);
  const handedInRef = useRef(handedIn);
  handedInRef.current = handedIn;
  const submitRef = useRef(submit);
  submitRef.current = submit;

  // Observation only — it never blocks answering, and everything it records
  // goes through the same outbox the answers do.
  const monitoring = useMonitoring({
    attemptId: handle.attemptId,
    questionId: current?.id,
    track,
    active: !handedIn,
  });
  const monitoringRef = useRef(monitoring);
  monitoringRef.current = monitoring;

  const performHandIn = useCallback(() => {
    if (handingIn || handedIn) return;
    setHandingIn(true);
    setSubmitError(null);
    // Bank the time on the question they're looking at before the paper closes.
    // submit() drains the outbox first, so anything queued now still gets in;
    // anything queued after would be refused as a mutation post-submission.
    monitoringRef.current.flush();
    void submitRef
      .current()
      .then(() => {
        markSubmitted(handle.code);
        setHandingIn(false);
        setShowCommentModal(true);
      })
      .catch((e: unknown) => {
        setSubmitError(e instanceof Error ? e.message : 'Could not hand in. Try again.');
        setHandingIn(false);
        autoSubmitStarted.current = false;
      });
  }, [handedIn, handingIn, handle.code, handle.attemptId]);

  const completeCommentFlow = useCallback(() => {
    setShowCommentModal(false);
    setHandedIn(true);
  }, []);

  // Hands in automatically when the server deadline passes. Also covers a
  // reload after time is up — the student shouldn't have to find the button.
  useEffect(() => {
    if (state.deadlineAt === null || handedIn || !restored || autoSubmitStarted.current) return;

    const trigger = () => {
      if (autoSubmitStarted.current || handedInRef.current) return;
      autoSubmitStarted.current = true;
      setTimeUp(true);
      performHandIn();
    };

    const remaining = Date.parse(state.deadlineAt) - Date.now();
    if (remaining <= 0) {
      trigger();
      return;
    }

    const timer = setTimeout(trigger, remaining);
    return () => {
      clearTimeout(timer);
    };
  }, [state.deadlineAt, handedIn, restored, performHandIn]);

  // Counted so the full explanation appears on the first disconnection and not
  // on every one after it. Once a student has seen why the page went amber, the
  // indicator alone is enough.
  const cue = useUiFeedback();

  // A cue when work reaches the server, and one when it stops reaching it.
  // Only on transitions, so a steady state is silent.
  const lastStatus = useRef<SyncStatus>(status);
  useEffect(() => {
    if (lastStatus.current !== status) {
      if (status === 'saved') cue('saved');
      if (status === 'blocked') cue('alert');
      lastStatus.current = status;
    }
  }, [status, cue]);

  const [outages, setOutages] = useState(0);
  useEffect(() => {
    if (status === 'offline') setOutages((n) => n + 1);
  }, [status]);

  // The recovery notice is the payoff for the whole offline design, and it is
  // also the one message nobody needs to keep looking at.
  useEffect(() => {
    if (recovered === null) return;
    const timer = setTimeout(clearRecovered, 6000);
    return () => {
      clearTimeout(timer);
    };
  }, [recovered, clearRecovered]);

  if (handedIn) {
    return (
      <Submitted attemptId={handle.attemptId} token={handle.token} outroBody={pkg.outroBody} />
    );
  }

  if (showCommentModal) {
    return (
      <CommentPromptModal
        attemptId={handle.attemptId}
        token={handle.token}
        onComplete={completeCommentFlow}
      />
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold">{pkg.title}</h1>
        <div className="flex items-baseline gap-3">
          {state.deadlineAt !== null && <Countdown deadlineAt={state.deadlineAt} />}
          {/* An indicator rather than a save button — saving is ambient. */}
          <SaveIndicator status={status} pending={pending} />
        </div>
      </header>

      {/* A stored copy must never pass itself off as a fresh read. The student
          is looking at what the server said earlier, and if their teacher has
          changed the paper since, this is not it. */}
      {source === 'local' && (
        <p
          className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm"
          role="status"
          data-testid="local-package"
        >
          Showing the copy saved on this device
          {savedAt === null ? '' : ` at ${new Date(savedAt).toLocaleTimeString()}`}. Your answers
          are still being recorded, and this will refresh once you&apos;re back online.
        </p>
      )}

      {/* The moment the whole offline design exists for. It used to pass in
          silence: the status went quietly back to "Saved" and nobody learnt
          that anything had been rescued. */}
      {recovered !== null && (
        <p
          className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm"
          role="status"
          data-testid="sync-recovered"
        >
          Back online —{' '}
          {recovered === 0 ? 'everything was already saved' : `${answers(recovered)} sent`}.
        </p>
      )}

      {/* Shown on the first disconnection only. The warning about reloading is
          the load-bearing part: answers are safe in IndexedDB, but the app
          shell is not cached, so a refresh while offline is the one action that
          actually strands a student. */}
      {status === 'offline' && outages <= 1 && (
        <p
          className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          data-testid="offline-explainer"
        >
          You&apos;ve lost connection. Keep working — your answers are saved on this device and will
          send by themselves when you&apos;re back. Don&apos;t reload the page.
        </p>
      )}

      {/* A refusal is worth interrupting for. "Offline" quietly retries because
          it usually fixes itself; this won't, and the student needs to fetch
          someone before they answer anything else. */}
      {syncError !== null && (
        <p className="text-sm text-destructive" data-testid="sync-error">
          {syncError} Tell your teacher before continuing.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-muted-foreground" data-testid="progress">
          {progress.settled} of {progress.total} answered
        </p>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={progress.settled}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-label="Questions answered"
        >
          <div
            className="transition-ui h-full rounded-full bg-primary"
            style={{
              width: `${String(progress.total === 0 ? 0 : (progress.settled / progress.total) * 100)}%`,
            }}
          />
        </div>
      </div>

      {rejection !== null && (
        <p className="text-sm text-destructive" role="alert" data-testid="rejection">
          {rejectionMessage(rejection)}
        </p>
      )}

      {timeUp && (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
          role="status"
          data-testid="time-up-auto-submit"
        >
          {handingIn || submitError === null
            ? 'Time is up — handing in your answers…'
            : 'Time is up — tap Hand in below to submit your answers.'}
        </p>
      )}

      {state.cursor === 0 && testDescription !== '' && (
        <div className="rounded-md border bg-muted/30 px-4 py-3" data-testid="test-intro">
          <p className="whitespace-pre-wrap text-sm">{testDescription}</p>
        </div>
      )}

      {/* The heading the current question sits under, if any. Sections are
          labels over one flat list — they change nothing about navigation or
          numbering, so this is purely where the student is told where they
          are. A test with no sections renders nothing here, exactly as before. */}
      {currentSection !== undefined && (
        <div className="border-l-2 border-primary/40 pl-3" data-testid="section-heading">
          <p className="text-sm font-semibold">{currentSection.title || 'Section'}</p>
          {currentSection.description !== null &&
            plainText(currentSection.description).trim() !== '' && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {plainText(currentSection.description)}
              </p>
            )}
        </div>
      )}

      {current !== undefined && (
        <Card
          /*
            Test-taking mode: a deterrent, not a boundary.
            select-none plus these handlers stop casual selection, right-click
            and Ctrl+C on the question. Anyone who opens devtools still has the
            text — the DOM is the DOM — and this does not pretend otherwise.
            Answer inputs are untouched, so typing still works normally.
          */
          className={pkg.testTakingMode ? 'select-none' : undefined}
          onCopy={
            pkg.testTakingMode
              ? (e) => {
                  e.preventDefault();
                }
              : undefined
          }
          onContextMenu={
            pkg.testTakingMode
              ? (e) => {
                  e.preventDefault();
                }
              : undefined
          }
          data-testid="question-card"
        >
          <CardContent className="pt-5">
            <QuestionView
              question={current}
              value={state.responses[current.id]}
              disabled={timeUp}
              onChange={(value) => {
                setRejection(dispatch({ t: 'answer', questionId: current.id, value }));
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Reserves the space the fixed bar occupies. Without it a long question
          ends underneath the controls, which is exactly what a fixed bar is
          supposed to prevent. */}
      <div aria-hidden className="h-28 sm:h-24" />

      {/*
        Fixed to the viewport so navigation stays reachable however long the
        question is. Ordered Previous / Next / Hand in on one row at small
        widths, which keeps the primary action under the thumb.

        pb-[env(safe-area-inset-bottom)] keeps it clear of the iOS home
        indicator, which otherwise overlaps the buttons on a phone.
      */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
        data-testid="take-nav"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-2 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              data-testid="prev"
              // Whether you can go back is the reducer's call, not ours —
              // allowNavigation is its rule and re-checking it here would mean
              // two copies that can disagree.
              disabled={!canDispatch({ t: 'navigate', to: state.cursor - 1 })}
              onClick={() => {
                // The message was about the answer just attempted; moving on
                // retires it.
                setRejection(null);
                dispatch({ t: 'navigate', to: state.cursor - 1 });
                cue('navigate');
              }}
            >
              Previous
            </Button>

            <span className="text-xs text-muted-foreground" data-testid="position">
              {state.cursor + 1} of {pkg.questions.length}
            </span>

            <Button
              variant="outline"
              data-testid="next"
              disabled={!canDispatch({ t: 'navigate', to: state.cursor + 1 })}
              onClick={() => {
                setRejection(null);
                dispatch({ t: 'navigate', to: state.cursor + 1 });
                cue('navigate');
              }}
            >
              Next
            </Button>
          </div>

          {/* Only marked as handed in once the server has actually taken it. A
              failed submit used to reject silently, so the button looked dead
              and the student had no idea their paper was still sitting here. */}
          <Button size="lg" data-testid="submit" disabled={handingIn} onClick={performHandIn}>
            {handingIn ? 'Handing in…' : 'Hand in'}
          </Button>
        </div>
      </div>

      {/* Stated before anything goes wrong, so the promise isn't only made at
          the moment it's being tested. */}
      <p className="text-center text-xs text-muted-foreground">
        Your answers are saved on this device, even without a connection.
      </p>

      {submitError !== null && (
        <p className="text-sm text-destructive" data-testid="submit-error">
          {submitError}
        </p>
      )}
    </main>
  );
};

// After hand-in. The token stays in memory so the student can check back once
// the teacher releases — there's no account to look the attempt up by.
const Submitted = ({
  attemptId,
  token,
  outroBody,
}: {
  attemptId: string;
  token: string;
  outroBody: RichText;
}) => {
  const [result, setResult] = useState<ReleasedResult | null>(null);
  const [notYet, setNotYet] = useState(false);

  const check = () => {
    void api
      .getReleasedResult({ attemptId, token })
      .then(setResult)
      .catch(() => {
        setNotYet(true);
      });
  };

  if (result !== null) {
    return (
      <main className="mx-auto max-w-2xl p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>{result.testTitle}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3" data-testid="result">
            <p className="text-2xl font-semibold" data-testid="result-score">
              {result.score} / {result.maxScore}
            </p>
            {result.items.map((item) => (
              <div key={item.questionId} className="text-sm">
                <p>{item.prompt || 'Untitled question'}</p>
                <p className="text-muted-foreground">
                  {item.awarded} / {item.points}
                </p>
                {item.feedback !== null && (
                  <p
                    className="mt-1 border-l-2 pl-2 text-muted-foreground italic"
                    data-testid={`feedback-${item.questionId}`}
                  >
                    {plainText(item.feedback)}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Handed in</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3" data-testid="take-done">
          {plainText(outroBody).trim() !== '' && (
            <p className="whitespace-pre-wrap text-sm" data-testid="test-outro">
              {plainText(outroBody)}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Your answers are saved. Your teacher will release results when marking is done.
          </p>
          <Button variant="outline" onClick={check} data-testid="check-result">
            Check for results
          </Button>
          {notYet && (
            <p className="text-sm text-muted-foreground" data-testid="not-released">
              Not released yet.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
};
