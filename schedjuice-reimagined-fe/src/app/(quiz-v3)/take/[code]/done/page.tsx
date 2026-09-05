"use client";

import { QuizRichContentHtml } from "@/components/quiz-v3/shared/quiz-rich-content";
import { QuizTakeCourseReturnButton } from "@/components/quiz-v3/shared/quiz-take-course-return-button";
import { QuizTakeShell } from "@/components/quiz-v3/shared/quiz-take-shell";
import { buttonVariants } from "@/components/primitives";
import { parseQuizThemeV3 } from "@/lib/quiz-v3-theme-presets";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

const storageKey = (code: string) => `quiz-v3-postsubmit-${code}`;

type Stored = {
  attemptId: number;
  outro_body: unknown;
  quiz_theme?: string;
  logo_url?: string | null;
  course_id?: number | null;
};

export default function QuizDonePage() {
  const params = useParams<{ code: string }>();
  const code = params.code ?? "";
  const [stored, setStored] = useState<Stored | null | undefined>(undefined);

  useEffect(() => {
    if (!code) {
      setStored(null);
      return;
    }
    try {
      const raw = sessionStorage.getItem(storageKey(code));
      if (!raw) {
        setStored(null);
        return;
      }
      const parsed = JSON.parse(raw) as Stored;
      if (
        typeof parsed?.attemptId !== "number" ||
        parsed.outro_body === undefined
      ) {
        setStored(null);
        return;
      }
      setStored(parsed);
      sessionStorage.removeItem(storageKey(code));
    } catch {
      setStored(null);
    }
  }, [code]);

  if (stored === undefined) {
    return (
      <QuizTakeShell contextLabel="Quiz" isBrandingLoading>
        <p className="text-text-secondary text-sm">Loading…</p>
      </QuizTakeShell>
    );
  }

  if (stored === null) {
    return (
      <QuizTakeShell contextLabel="Quiz">
        <p className="text-text-secondary text-sm" role="status">
          Nothing to show here.{" "}
          <Link href={`/take/${code}`} className="text-primary underline">
            Back to quiz
          </Link>
        </p>
      </QuizTakeShell>
    );
  }

  const theme = parseQuizThemeV3(stored.quiz_theme);

  return (
    <QuizTakeShell
      contextLabel="Quiz"
      theme={theme}
      logoUrl={stored.logo_url}
    >
      <div className="space-y-6">
        <h1 className="text-text-primary text-xl font-semibold tracking-tight">
          Submitted
        </h1>
        <div className="text-text-primary/90">
          <QuizRichContentHtml value={stored.outro_body} />
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/take/${code}/attempt/${stored.attemptId}`}
            className={cn(buttonVariants(), "cursor-pointer")}
          >
            View results
          </Link>
          {typeof stored.course_id === "number" &&
          Number.isFinite(stored.course_id) ? (
            <QuizTakeCourseReturnButton
              courseId={stored.course_id}
              layout="inline"
            />
          ) : null}
        </div>
      </div>
    </QuizTakeShell>
  );
}
