"use client";
import { Input, Radio, RadioGroup, Textarea } from "@/components/primitives";

import { QuizRichContentHtml } from "@/components/quiz-v3/shared/quiz-rich-content";
import {
  listFillBlankUuidsForTaker,
  replaceFillBlankWithGapInDoc,
} from "@/helpers/quizFillBlankDoc";
import {
  findFillBlankSlotByBlankUuid,
  getFillBlankSlotAnswerMode,
  sortedFillBlankChoiceOptions,
} from "@/helpers/quizFillBlankSlotMode";
import { cn } from "@/lib/utils";
import {
  FillBlankAnswerMode,
  QuestionType,
  type QuestionTypeV3,
} from "@/types/quiz-v3";
import { Search } from "iconoir-react";
import { useEffect, useRef, useState } from "react";
import { MultiChoiceSelector } from "./multi-choice-selector";
import { SingleChoiceSelector } from "./single-choice-selector";

/**
 * Tailwind classes toggled on the matching `<span data-blank-id="…">` in the
 * rendered prompt while a Blank N magnifier is hovered / tapped. Listed as
 * literals so Tailwind's content scan keeps them in the build.
 */
const BLANK_HIGHLIGHT_CLASSES = [
  "bg-amber-200/80",
  "ring-2",
  "ring-amber-400",
  "text-amber-900",
];

type Props = {
  question: QuestionTypeV3;
  selectedIds: number[];
  /** Fill-in-the-blank: answers keyed by blank UUID. */
  fillAnswers: Record<string, string>;
  onChoiceChange: (ids: number[]) => void;
  onFillAnswerChange: (blankUuid: string, text: string) => void;
  /** True/false learner selection; `undefined` radial group unselected. */
  trueFalseChoice: boolean | undefined;
  onTrueFalseChoice: (v: boolean) => void;
  shortOrEssayText: string;
  onShortOrEssayChange: (t: string) => void;
};

export function QuestionDisplay({
  question,
  selectedIds,
  fillAnswers,
  onChoiceChange,
  onFillAnswerChange,
  trueFalseChoice,
  onTrueFalseChoice,
  shortOrEssayText,
  onShortOrEssayChange,
}: Props) {
  const plain = question.body_plaintext?.trim();
  const promptEmpty = !plain && question.body == null;
  const promptValue =
    question.question_type === QuestionType.FillInBlank
      ? replaceFillBlankWithGapInDoc(question.body ?? {})
      : question.body ?? question.body_plaintext ?? plain;

  const fibOrder =
    question.question_type === QuestionType.FillInBlank
      ? listFillBlankUuidsForTaker(question)
      : [];

  const tfGroupValue =
    trueFalseChoice === true ? "true" : trueFalseChoice === false ? "false" : "";

  const qidStr = question.id != null ? String(question.id) : "q";

  const promptRef = useRef<HTMLDivElement>(null);
  const [pinnedBlankId, setPinnedBlankId] = useState<string | null>(null);
  const [hoverBlankId, setHoverBlankId] = useState<string | null>(null);
  const highlightedBlankId = pinnedBlankId ?? hoverBlankId;

  useEffect(() => {
    setPinnedBlankId(null);
    setHoverBlankId(null);
  }, [question.id, question.client_id]);

  useEffect(() => {
    const root = promptRef.current;
    if (!root) return;
    const targets = root.querySelectorAll<HTMLElement>("[data-blank-id]");
    targets.forEach((el) => {
      const isMatch =
        highlightedBlankId !== null &&
        el.getAttribute("data-blank-id") === highlightedBlankId;
      if (isMatch) {
        el.classList.add(...BLANK_HIGHLIGHT_CLASSES);
      } else {
        el.classList.remove(...BLANK_HIGHLIGHT_CLASSES);
      }
    });
  }, [highlightedBlankId, promptValue]);

  return (
    <div className="space-y-4">
      <div ref={promptRef} className="text-lg font-medium leading-relaxed">
        {promptEmpty ? (
          "Question"
        ) : (
          <QuizRichContentHtml value={promptValue} />
        )}
      </div>

      {question.question_type === QuestionType.FillInBlank ? (
        <div className="space-y-4">
          {fibOrder.map((blankUuid, i) => {
            const slot = findFillBlankSlotByBlankUuid(question, blankUuid);
            const sortedChoices = slot
              ? sortedFillBlankChoiceOptions(slot)
              : [];
            const mode = slot
              ? getFillBlankSlotAnswerMode(slot)
              : FillBlankAnswerMode.Typed;
            const useChoice =
              mode === FillBlankAnswerMode.SingleChoice &&
              sortedChoices.length > 0;
            const learnerVal = (fillAnswers[blankUuid] ?? "").trim();
            const selectedIdx = sortedChoices.findIndex(
              (o) => o.text.trim() === learnerVal,
            );
            const isPinned = pinnedBlankId === blankUuid;

            return (
              <div key={blankUuid} className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-text-muted text-sm"
                    id={`quiz-fill-legend-${qidStr}-${blankUuid}`}
                  >
                    Blank {i + 1}
                  </span>
                  <button
                    type="button"
                    aria-label={`Show Blank ${i + 1} in the prompt`}
                    aria-pressed={isPinned}
                    title={`Show Blank ${i + 1} in the prompt`}
                    onMouseEnter={() => setHoverBlankId(blankUuid)}
                    onMouseLeave={() => setHoverBlankId(null)}
                    onFocus={() => setHoverBlankId(blankUuid)}
                    onBlur={() => setHoverBlankId(null)}
                    onClick={() =>
                      setPinnedBlankId((prev) =>
                        prev === blankUuid ? null : blankUuid,
                      )
                    }
                    className={cn(
                      "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-sunken hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isPinned && "bg-surface-sunken text-text-primary",
                    )}
                  >
                    <Search className="size-4" aria-hidden />
                  </button>
                </div>
                {useChoice ? (
                  <RadioGroup
                    aria-labelledby={`quiz-fill-legend-${qidStr}-${blankUuid}`}
                    value={selectedIdx >= 0 ? String(selectedIdx) : undefined}
                    onValueChange={(v) => {
                      const idx = Number.parseInt(v, 10);
                      onFillAnswerChange(
                        blankUuid,
                        sortedChoices[idx]?.text ?? "",
                      );
                    }}
                    className="max-w-xl space-y-2"
                  >
                    {sortedChoices.map((opt, oi) => (
                      <div
                        key={opt.id ?? `${blankUuid}-choice-${oi}`}
                        className="flex items-start gap-2"
                      >
                        <Radio
                          value={String(oi)}
                          id={`quiz-fill-${qidStr}-${blankUuid}-${oi}`}
                          className="mt-1"
                        />
                        <label
                          htmlFor={`quiz-fill-${qidStr}-${blankUuid}-${oi}`}
                          className="cursor-pointer font-normal leading-snug"
                        >
                          {opt.text.trim() ? opt.text : "—"}
                        </label>
                      </div>
                    ))}
                  </RadioGroup>
                ) : (
                  <Input
                    aria-labelledby={`quiz-fill-legend-${qidStr}-${blankUuid}`}
                    id={`quiz-fill-${qidStr}-${blankUuid}`}
                    value={fillAnswers[blankUuid] ?? ""}
                    onChange={(e) =>
                      onFillAnswerChange(blankUuid, e.target.value)
                    }
                    placeholder="Your answer"
                    autoComplete="off"
                    className="max-w-xl"
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : question.question_type === QuestionType.SingleChoice ? (
        <SingleChoiceSelector
          question={question}
          selectedId={selectedIds[0] ?? null}
          onChange={(id) => onChoiceChange([id])}
        />
      ) : question.question_type === QuestionType.MultipleChoice ? (
        <MultiChoiceSelector
          question={question}
          selectedIds={selectedIds}
          onChange={onChoiceChange}
        />
      ) : question.question_type === QuestionType.TrueFalse ? (
        <div className="space-y-2">
          <label className="text-text-primary font-medium">
            Choose one
          </label>
          <RadioGroup
            value={tfGroupValue === "" ? undefined : tfGroupValue}
            onValueChange={(v) => onTrueFalseChoice(v === "true")}
            className="flex flex-col gap-3 sm:flex-row sm:gap-10"
          >
            <div className="flex items-center gap-2">
              <Radio value="true" id={`quiz-tf-${qidStr}-true`} />
              <label
                htmlFor={`quiz-tf-${qidStr}-true`}
                className="cursor-pointer font-normal leading-snug"
              >
                True
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Radio value="false" id={`quiz-tf-${qidStr}-false`} />
              <label
                htmlFor={`quiz-tf-${qidStr}-false`}
                className="cursor-pointer font-normal leading-snug"
              >
                False
              </label>
            </div>
          </RadioGroup>
        </div>
      ) : question.question_type === QuestionType.ShortAnswer ? (
        <div className="space-y-2 max-w-xl">
          <label htmlFor={`quiz-sa-${qidStr}`} className="text-text-primary">
            Your answer
          </label>
          <Input
            id={`quiz-sa-${qidStr}`}
            value={shortOrEssayText}
            onChange={(e) => onShortOrEssayChange(e.target.value)}
            placeholder="Short answer"
            autoComplete="off"
          />
        </div>
      ) : question.question_type === QuestionType.Essay ? (
        <div className="space-y-2 max-w-2xl">
          <label htmlFor={`quiz-essay-${qidStr}`} className="text-text-primary">
            Your answer
          </label>
          <Textarea
            id={`quiz-essay-${qidStr}`}
            value={shortOrEssayText}
            onChange={(e) => onShortOrEssayChange(e.target.value)}
            placeholder="Write your answer here"
            className="min-h-[140px]"
            autoComplete="off"
          />
        </div>
      ) : (
        null
      )}
    </div>
  );
}
