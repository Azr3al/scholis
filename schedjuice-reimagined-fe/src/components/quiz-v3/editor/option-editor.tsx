"use client";
import { Button } from "@/components/primitives";

import { QuestionType } from "@/types/quiz-v3";
import type { JSONContent } from "@tiptap/core";
import { Trash as Trash2 } from "iconoir-react";
import { QuizOptionRichText } from "./quiz-rich-text-editor";

type Props = {
  quizId: number;
  onImageUploadPendingDelta: (delta: number) => void;
  questionType: QuestionType;
  optionIndex: number;
  radioGroupName: string;
  body: unknown;
  isCorrect: boolean;
  onBodyChange: (v: JSONContent) => void;
  onMarkCorrect: () => void;
  onRemove: () => void;
  canRemove: boolean;
  /** Stable key so TipTap remounts when the option row identity changes. */
  richTextKey: string;
  /** Server validation messages from editor-sync (shown under the rich editor). */
  serverErrorMessages?: string[];
};

export function OptionEditor({
  quizId,
  onImageUploadPendingDelta,
  questionType,
  optionIndex,
  radioGroupName,
  body,
  isCorrect,
  onBodyChange,
  onMarkCorrect,
  onRemove,
  canRemove,
  richTextKey,
  serverErrorMessages,
}: Props) {
  const choiceLetter = String.fromCharCode(65 + optionIndex);
  const rowLabel = `Choice ${choiceLetter}`;
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-border/90 bg-surface-elevated p-4 sm:flex-row sm:items-start"
      role="group"
      aria-labelledby={`opt-${richTextKey}-label`}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <p
          className="text-sm font-medium text-text-primary"
          id={`opt-${richTextKey}-label`}
        >
          {rowLabel}
        </p>
        <QuizOptionRichText
          key={richTextKey}
          body={body}
          onChange={onBodyChange}
          quizId={quizId}
          onImageUploadPendingDelta={onImageUploadPendingDelta}
        />
        {serverErrorMessages && serverErrorMessages.length > 0 ? (
          <p className="text-danger text-sm leading-snug" role="alert">
            {serverErrorMessages.join(" ")}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-row items-center gap-2 self-start sm:pt-7">
        {questionType === QuestionType.SingleChoice ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name={radioGroupName}
              checked={isCorrect}
              onChange={onMarkCorrect}
              className="cursor-pointer"
              aria-label={`Option ${optionIndex + 1}: mark as correct`}
            />
            Correct
          </label>
        ) : null}
        {questionType === QuestionType.MultipleChoice ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isCorrect}
              onChange={onMarkCorrect}
              className="cursor-pointer"
              aria-label={`Option ${optionIndex + 1}: mark as correct`}
            />
            Correct
          </label>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="cursor-pointer size-8 p-0"
          disabled={!canRemove}
          onClick={onRemove}
          aria-label="Remove option"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
