'use client';

import { RichTextView } from '@/components/rich-text/rich-text-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, type AttemptMarkingView, type AttemptSummary, type GradingStatus } from '@/lib/api';
import { plainText, textDoc } from '@/lib/take/rich-text';
import type { ResponseValue, RichText } from '@scholis/schema';
import Link from 'next/link';
import { use, useCallback, useEffect, useMemo, useState } from 'react';

type SortMode = 'recent' | 'score';

const sortAttempts = (attempts: AttemptSummary[], mode: SortMode): AttemptSummary[] => {
  const copy = [...attempts];
  if (mode === 'score') {
    copy.sort((a, b) => {
      const scoreA = a.score;
      const scoreB = b.score;
      if (scoreA === null && scoreB === null) {
        return (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '');
      }
      if (scoreA === null) return 1;
      if (scoreB === null) return -1;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '');
    });
    return copy;
  }

  copy.sort((a, b) => {
    const aTime = a.submittedAt ?? '';
    const bTime = b.submittedAt ?? '';
    if (aTime === '' && bTime === '') return 0;
    if (aTime === '') return 1;
    if (bTime === '') return -1;
    return bTime.localeCompare(aTime);
  });
  return copy;
};

/** Rounded to something a teacher would actually say out loud. */
const formatDuration = (ms: number): string => {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes)}m ${String(seconds % 60)}s`;
};

/** Only the leaving counts — every 'hidden' has a matching 'visible'. */
const countAway = (events: { kind: string }[]): number =>
  events.filter((event) => event.kind === 'hidden' || event.kind === 'blur').length;

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export default function SubmissionsPage({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = use(params);
  const [data, setData] = useState<{ attempts: AttemptSummary[]; status: GradingStatus } | null>(
    null,
  );
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('recent');

  const sortedAttempts = useMemo(
    () => (data === null ? [] : sortAttempts(data.attempts, sortMode)),
    [data, sortMode],
  );

  const release = () => {
    setReleasing(true);
    setError(null);
    void api
      .releaseResults(testId)
      .then((r) => {
        // Partially-marked cohorts are normal, so say what actually went out.
        setNote(`Released ${String(r.released)}, ${String(r.pending)} still need marking.`);
        setConfirming(false);
        load();
      })
      .catch((e: unknown) => {
        setError(message(e, 'Could not release results.'));
      })
      .finally(() => {
        setReleasing(false);
      });
  };

  const load = useCallback(() => {
    void api
      .listAttempts(testId)
      .then(setData)
      .catch((e: unknown) => {
        setError(message(e, 'Could not load submissions.'));
      });
  }, [testId]);

  useEffect(load, [load]);

  if (error !== null && data === null) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-destructive">{error}</p>
      </main>
    );
  }

  if (data === null) {
    return <main className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">Loading…</main>;
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <header>
        <Link
          href={`/teacher/${testId}`}
          className="text-sm text-muted-foreground transition-ui hover:text-foreground"
        >
          ← Back to the test
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Submissions</h1>
          <Link href={`/teacher/${testId}/comments`}>
            <Button variant="outline" size="sm">
              Comments
            </Button>
          </Link>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="grading-status">
          {data.status.awaitingMarking} awaiting marking · {data.status.readyToRelease} ready ·{' '}
          {data.status.released} released
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={sortMode === 'recent' ? 'default' : 'outline'}
            size="sm"
            aria-pressed={sortMode === 'recent'}
            data-testid="sort-recent"
            onClick={() => {
              setSortMode('recent');
            }}
          >
            Most recent
          </Button>
          <Button
            type="button"
            variant={sortMode === 'score' ? 'default' : 'outline'}
            size="sm"
            aria-pressed={sortMode === 'score'}
            data-testid="sort-score"
            onClick={() => {
              setSortMode('score');
            }}
          >
            Score
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-3" data-testid="attempt-list">
        {sortedAttempts.map((attempt) => (
          <Card key={attempt.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{attempt.takerName}</p>
                <p className="text-sm text-muted-foreground">
                  {attempt.score ?? '—'} / {attempt.maxScore ?? '—'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={attempt.status === 'released' ? 'default' : 'secondary'}>
                  {attempt.status}
                </Badge>
                {attempt.submittedAt !== null && (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-expanded={open === attempt.id}
                    data-testid={`mark-${attempt.takerName}`}
                    onClick={() => {
                      setOpen(open === attempt.id ? null : attempt.id);
                    }}
                  >
                    Mark
                  </Button>
                )}
              </div>
            </CardContent>
            {open === attempt.id && <Marking attemptId={attempt.id} onMarked={load} />}
          </Card>
        ))}

        {sortedAttempts.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="no-attempts">
            Nobody has sat this test yet. Share the code and their submissions will appear here.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {/* Releasing is outward-facing and immediate — students see their marks
            the moment it lands. Worth one deliberate second. */}
        {confirming ? (
          <div className="flex flex-col gap-3 rounded-md border p-4">
            <p className="text-sm">
              Students will see their scores and feedback straight away. Anything still unmarked
              stays back until you mark it.
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={releasing}
                data-testid="confirm-release"
                onClick={release}
              >
                {releasing ? 'Releasing…' : 'Release now'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setConfirming(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="lg"
            disabled={data.attempts.length === 0}
            data-testid="release"
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
          >
            Release results
          </Button>
        )}

        {note !== null && (
          <p className="text-sm text-muted-foreground" data-testid="release-message">
            {note}
          </p>
        )}
        {error !== null && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </main>
  );
}

const Marking = ({ attemptId, onMarked }: { attemptId: string; onMarked: () => void }) => {
  const [view, setView] = useState<AttemptMarkingView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .getAttemptMarking(attemptId)
      .then(setView)
      .catch((e: unknown) => {
        setError(message(e, 'Could not load this attempt.'));
      });
  }, [attemptId]);

  if (error !== null) {
    return <CardContent className="pt-0 text-sm text-destructive">{error}</CardContent>;
  }
  if (view === null) {
    return <CardContent className="pt-0 text-sm text-muted-foreground">Loading…</CardContent>;
  }

  return (
    <CardContent className="flex flex-col gap-4 border-t pt-4">
      {/*
        What the browser saw, not what the student did. A notification stealing
        focus looks exactly like opening another tab, so this is reported as
        observations with times and left to the teacher to interpret.
      */}
      {view.events.length > 0 && (
        <div className="rounded-md border bg-muted/30 p-3" data-testid="attempt-events">
          <p className="text-xs font-medium">
            Left the test {countAway(view.events)} time
            {countAway(view.events) === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The tab was hidden or the window lost focus. Browsers cannot tell why.
          </p>
        </div>
      )}
      {view.items.map((item) => (
        <div key={item.questionId}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">{item.prompt || 'Untitled question'}</p>
            {item.timeSpentMs > 0 && (
              <span
                className="shrink-0 text-xs text-muted-foreground"
                data-testid={`time-spent-${item.questionId}`}
              >
                {formatDuration(item.timeSpentMs)}
              </span>
            )}
          </div>
          <StudentAnswer response={item.response} />

          {item.status === 'auto' ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {item.awarded ?? 0} / {item.points} — marked automatically
            </p>
          ) : (
            <MarkInput
              attemptId={attemptId}
              questionId={item.questionId}
              points={item.points}
              current={item.awarded}
              feedback={item.feedback}
              onMarked={onMarked}
            />
          )}
        </div>
      ))}
    </CardContent>
  );
};

// What the student actually wrote. Essays are the only thing marked by hand, so
// showing the prose is the whole point of this panel — a score box next to the
// words "Written answer" is asking someone to mark blind.
const StudentAnswer = ({ response }: { response: ResponseValue | null }) => {
  if (response === null) {
    return <p className="mt-1 text-sm text-muted-foreground italic">No answer</p>;
  }

  if (response.kind === 'essay') {
    const text = plainText(response.doc);
    if (text === '') {
      return <p className="mt-1 text-sm text-muted-foreground italic">Left blank</p>;
    }
    return (
      <div className="mt-1 rounded-md bg-muted p-3 text-sm" data-testid="marking-answer">
        <RichTextView doc={response.doc} />
      </div>
    );
  }

  if (response.kind === 'short') {
    const text = plainText(response.doc);
    if (text === '') {
      return <p className="mt-1 text-sm text-muted-foreground italic">Left blank</p>;
    }
    return (
      <div className="mt-1 rounded-md bg-muted p-3 text-sm" data-testid="marking-answer">
        <RichTextView doc={response.doc} />
      </div>
    );
  }

  // Choice questions are marked automatically, so nobody reads this to decide a
  // score. The option labels aren't in the marking contract, and adding them
  // would be a backend change for something that only ever gets glanced at.
  return <p className="mt-1 text-sm text-muted-foreground">{response.optionIds.length} selected</p>;
};

const MarkInput = ({
  attemptId,
  questionId,
  points,
  current,
  feedback,
  onMarked,
}: {
  attemptId: string;
  questionId: string;
  points: number;
  current: number | null;
  feedback: RichText | null;
  onMarked: () => void;
}) => {
  const [score, setScore] = useState(String(current ?? ''));
  // Seeded from what's already saved. Starting blank meant that re-saving a
  // mark sent feedback: null and quietly wiped what the teacher wrote before.
  const [comment, setComment] = useState(feedback === null ? '' : plainText(feedback));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-2 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        void api
          .scoreWrittenAnswer({
            attemptId,
            questionId,
            score: Number(score),
            // Empty stays null rather than an empty document — the student's
            // result page hides feedback that isn't there.
            feedback: comment.trim() === '' ? null : textDoc(comment),
          })
          .then(onMarked)
          .catch((err: unknown) => {
            setError(message(err, 'Could not save that mark.'));
          })
          .finally(() => {
            setSaving(false);
          });
      }}
    >
      <Textarea
        placeholder="Feedback for the student (optional)"
        value={comment}
        onChange={(e) => {
          setComment(e.target.value);
        }}
        data-testid={`feedback-${questionId}`}
      />
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          max={points}
          required
          value={score}
          onChange={(e) => {
            setScore(e.target.value);
          }}
          className="w-24"
          data-testid={`score-${questionId}`}
        />
        <span className="text-sm text-muted-foreground">/ {points}</span>
        <Button type="submit" size="sm" disabled={saving} data-testid={`save-mark-${questionId}`}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {error !== null && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
};
