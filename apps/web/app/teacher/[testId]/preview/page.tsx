'use client';

import { QuestionView } from '@/components/take/question-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { testDetailToPreviewPackage } from '@/lib/teacher/preview-package';
import { plainText } from '@/lib/take/rich-text';
import type { TestPackage } from '@scholis/schema';
import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

export default function TestPreviewPage({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = use(params);
  const [pkg, setPkg] = useState<TestPackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [showOutro, setShowOutro] = useState(false);

  const load = useCallback(() => {
    api
      .getTest(testId)
      .then((test) => {
        setPkg(testDetailToPreviewPackage(test));
        setCursor(0);
        setShowOutro(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not load this test.');
      });
  }, [testId]);

  useEffect(load, [load]);

  if (error !== null) {
    return (
      <main className="mx-auto max-w-2xl p-4 sm:p-6">
        <p className="text-destructive">{error}</p>
      </main>
    );
  }

  if (pkg === null) {
    return (
      <main className="mx-auto max-w-2xl p-4 sm:p-6">
        <p className="text-muted-foreground">Loading preview…</p>
      </main>
    );
  }

  const testDescription = plainText(pkg.introBody).trim();
  const outroMessage = plainText(pkg.outroBody).trim();
  const current = pkg.questions[cursor];
  const currentSection =
    current?.sectionId === null || current?.sectionId === undefined
      ? undefined
      : pkg.sections.find((section) => section.id === current.sectionId);
  const atEnd = cursor >= pkg.questions.length - 1;

  if (showOutro) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-6">
        <p
          className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm"
          role="status"
        >
          Preview — nothing is saved.
        </p>
        <Card>
          <CardContent className="flex flex-col gap-3 pt-5">
            <h1 className="text-xl font-semibold">Handed in</h1>
            {outroMessage !== '' && (
              <p className="whitespace-pre-wrap text-sm" data-testid="preview-outro">
                {outroMessage}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Your answers are saved. Your teacher will release results when marking is done.
            </p>
          </CardContent>
        </Card>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setShowOutro(false);
            }}
          >
            Back to questions
          </Button>
          <Link href={`/teacher/${testId}`}>
            <Button variant="outline">Back to editor</Button>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm"
          role="status"
        >
          Preview — nothing is saved.
        </p>
        <Link href={`/teacher/${testId}`}>
          <Button variant="outline" size="sm">
            Back to editor
          </Button>
        </Link>
      </div>

      <header>
        <h1 className="text-xl font-semibold">{pkg.title}</h1>
      </header>

      {cursor === 0 && testDescription !== '' && (
        <div className="rounded-md border bg-muted/30 px-4 py-3" data-testid="preview-intro">
          <p className="whitespace-pre-wrap text-sm">{testDescription}</p>
        </div>
      )}

      {currentSection !== undefined && (
        <div className="border-l-2 border-primary/40 pl-3">
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
        <Card>
          <CardContent className="pt-5">
            <QuestionView
              question={current}
              value={undefined}
              disabled
              onChange={() => {
                /* read-only preview */
              }}
            />
          </CardContent>
        </Card>
      )}

      {pkg.questions.length === 0 && (
        <p className="text-sm text-muted-foreground">No questions yet.</p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={cursor === 0 || !pkg.allowNavigation}
          onClick={() => {
            setCursor((value) => Math.max(0, value - 1));
          }}
        >
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          {pkg.questions.length === 0 ? '0 of 0' : `${String(cursor + 1)} of ${String(pkg.questions.length)}`}
        </span>
        {atEnd || pkg.questions.length === 0 ? (
          <Button
            data-testid="preview-hand-in"
            onClick={() => {
              setShowOutro(true);
            }}
          >
            Preview hand-in
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              setCursor((value) => value + 1);
            }}
          >
            Next
          </Button>
        )}
      </div>
    </main>
  );
}
