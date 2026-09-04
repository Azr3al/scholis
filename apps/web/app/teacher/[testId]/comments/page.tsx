'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api, type AttemptComment } from '@/lib/api';
import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

const formatWhen = (iso: string | null): string =>
  iso === null ? '—' : new Date(iso).toLocaleString();

export default function CommentsPage({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = use(params);
  const [comments, setComments] = useState<AttemptComment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void api
      .listComments(testId)
      .then((data) => {
        setComments(data.comments);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not load comments.');
      });
  }, [testId]);

  useEffect(load, [load]);

  if (error !== null && comments === null) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-destructive">{error}</p>
      </main>
    );
  }

  if (comments === null) {
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
          <h1 className="text-2xl font-semibold tracking-tight">Comments</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/teacher/${testId}/submissions`}>
              <Button variant="outline" size="sm">
                Submissions
              </Button>
            </Link>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Optional feedback students left after handing in.
        </p>
      </header>

      <div className="flex flex-col gap-3" data-testid="comment-list">
        {comments.map((comment) => (
          <Card key={comment.attemptId}>
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{comment.takerName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatWhen(comment.commentAt)}
                </p>
              </div>
              <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
              {comment.submittedAt !== null && (
                <p className="text-xs text-muted-foreground">
                  Handed in {formatWhen(comment.submittedAt)}
                </p>
              )}
            </CardContent>
          </Card>
        ))}

        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="no-comments">
            No feedback yet.
          </p>
        )}
      </div>
    </main>
  );
}
