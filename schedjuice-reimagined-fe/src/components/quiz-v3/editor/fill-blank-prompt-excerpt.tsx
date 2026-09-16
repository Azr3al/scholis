"use client";

import { getFillBlankPromptExcerpt } from "@/helpers/quizFillBlankPromptExcerpt";
import { cn } from "@/lib/utils";

const NOT_IN_PROMPT = "This blank is not in the prompt.";

type Props = {
  body: unknown;
  blankUuid: string | undefined;
  excerptId: string;
  className?: string;
};

export function FillBlankPromptExcerpt({
  body,
  blankUuid,
  excerptId,
  className,
}: Props) {
  if (!blankUuid) {
    return (
      <p id={excerptId} className={cn("text-text-muted text-sm", className)}>
        {NOT_IN_PROMPT}
      </p>
    );
  }

  const result = getFillBlankPromptExcerpt(body, blankUuid);
  if (result.kind === "missing") {
    return (
      <p id={excerptId} className={cn("text-text-muted text-sm", className)}>
        {NOT_IN_PROMPT}
      </p>
    );
  }

  const {
    ellipsisBefore,
    beforeWords,
    gapLabel,
    afterWords,
    ellipsisAfter,
  } = result;

  return (
    <p
      id={excerptId}
      className={cn(
        "text-text-muted flex flex-wrap items-baseline gap-x-1 gap-y-1 text-sm leading-snug",
        className,
      )}
    >
      {ellipsisBefore ? <span>…</span> : null}
      {beforeWords.map((w, wi) => (
        <span key={`b-${wi}-${w}`}>{w}</span>
      ))}
      <span
        className="rounded-sm border border-emerald-600/45 bg-emerald-500/12 px-1.5 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-400/12 dark:text-emerald-100"
        title="Blank in prompt"
      >
        {gapLabel}
      </span>
      {afterWords.map((w, wi) => (
        <span key={`a-${wi}-${w}`}>{w}</span>
      ))}
      {ellipsisAfter ? <span>…</span> : null}
    </p>
  );
}
