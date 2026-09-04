'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useState } from 'react';

const dismissKey = (attemptId: string) => `comment-dismissed-${attemptId}`;

export const markCommentDismissed = (attemptId: string): void => {
  sessionStorage.setItem(dismissKey(attemptId), '1');
};

export const isCommentDismissed = (attemptId: string): boolean =>
  sessionStorage.getItem(dismissKey(attemptId)) === '1';

export const CommentPromptModal = ({
  attemptId,
  token,
  onComplete,
}: {
  attemptId: string;
  token: string;
  onComplete: () => void;
}) => {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skip = () => {
    markCommentDismissed(attemptId);
    onComplete();
  };

  const send = () => {
    const trimmed = body.trim();
    if (trimmed === '') {
      skip();
      return;
    }

    setSaving(true);
    setError(null);
    void api
      .submitComment({ attemptId, token, body: trimmed })
      .then(() => {
        markCommentDismissed(attemptId);
        onComplete();
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not send your feedback.');
        setSaving(false);
      });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      data-testid="comment-prompt"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-lg">How was the test?</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Optional — share anything about the test experience. Your teacher may read this.
          </p>
          <Textarea
            value={body}
            maxLength={2000}
            rows={4}
            placeholder="Too long, unclear questions, liked the format…"
            disabled={saving}
            onChange={(e) => {
              setBody(e.target.value);
            }}
            data-testid="comment-body"
          />
          {error !== null && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={saving} data-testid="comment-submit" onClick={send}>
              {saving ? 'Sending…' : 'Send feedback'}
            </Button>
            <Button variant="ghost" disabled={saving} data-testid="comment-skip" onClick={skip}>
              Skip
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
