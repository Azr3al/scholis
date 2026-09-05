"use client";
import { Checkbox, Radio, RadioGroup } from "@/components/primitives";

import {
  QuizRichContentHtml,
  QuizRichOptionContent,
} from "@/components/quiz-v3/shared/quiz-rich-content";
import { formatQuizScorePair } from "@/helpers/formatters";
import { acceptableAnswerToPlainText } from "@/helpers/quizFillBlankAcceptableText";
import {
  listFillBlankUuidsForTaker,
  replaceFillBlankWithGapInDoc,
} from "@/helpers/quizFillBlankDoc";
import {
  findFillBlankSlotByBlankUuid,
  getFillBlankSlotsArray,
  getFillBlankSlotAnswerMode,
  sortedFillBlankChoiceOptions,
} from "@/helpers/quizFillBlankSlotMode";
import { isQuizV3TiptapDocEmpty } from "@/helpers/quiz-v3-tiptap-empty";
import {
  FillBlankAnswerMode,
  QuestionType,
  type QuestionTypeV3,
} from "@/types/quiz-v3";
import { cn } from "@/lib/utils";

function sortedOptions(q: QuestionTypeV3) {
  const opts = [...(q.options ?? [])];
  opts.sort(
    (a, b) =>
      (a.display_order ?? 0) - (b.display_order ?? 0) || (a.id ?? 0) - (b.id ?? 0),
  );
  return opts;
}

function sortedFillSlots(q: QuestionTypeV3) {
  const slots = [...getFillBlankSlotsArray(q)];
  slots.sort(
    (a, b) =>
      (a.display_order ?? 0) - (b.display_order ?? 0) || (a.id ?? 0) - (b.id ?? 0),
  );
  return slots;
}

function optionRowClass(isCorrect: boolean, isWrongSelection: boolean) {
  if (isWrongSelection) {
    return "border-destructive/45 bg-danger/10";
  }
  if (isCorrect) {
    return "border-success/45 bg-success/10";
  }
  return "border-border bg-surface-sunken/15";
}

type Props = {
  question: QuestionTypeV3;
  selectedOptionIds: number[];
  /** Fill-in-the-blank: plain string (legacy) or map blank UUID → answer. */
  responseText?: string | Record<string, unknown>;
  /** Points earned for this answer / max points for the question. */
  answerScore: string | number;
  maxPoints: number;
  /** Attempt not submitted yet — hide numeric score. */
  inProgress?: boolean;
  /** Extra classes on the outer `Card`. */
  cardClassName?: string;
  /** After results release — staff feedback (TipTap JSON). */
  essayFeedbackDoc?: unknown;
  essayComments?: Array<{
    anchor_start: number;
    anchor_end: number;
    body: string;
  }>;
};

/** Graded question: taker-like layout, correct options green, incorrect selections red. */
export function AttemptQuestionReadonly({
  question,
  selectedOptionIds,
  responseText,
  answerScore,
  maxPoints,
  inProgress = false,
  cardClassName,
  essayFeedbackDoc,
  essayComments,
}: Props) {
  const selected = new Set(selectedOptionIds);
  const qid = question.id ?? "q";
  const options = sortedOptions(question);
  const fibSlots = sortedFillSlots(question);
  const plain = question.body_plaintext?.trim();
  const promptEmpty = !plain && question.body == null;
  const promptValue =
    question.question_type === QuestionType.FillInBlank
      ? replaceFillBlankWithGapInDoc(question.body ?? {})
      : question.body ?? question.body_plaintext ?? plain;

  const fibResponseMap: Record<string, string> =
    typeof responseText === "string"
      ? {}
      : responseText &&
          typeof responseText === "object" &&
          !Array.isArray(responseText) &&
          question.question_type === QuestionType.FillInBlank
        ? Object.fromEntries(
            Object.entries(responseText as Record<string, unknown>).map(([k, v]) => [
              k,
              v == null ? "" : String(v),
            ]),
          )
        : {};

  const typedResponseFlat =
    question.question_type !== QuestionType.FillInBlank &&
    responseText &&
    typeof responseText === "object" &&
    !Array.isArray(responseText)
      ? (responseText as Record<string, unknown>)
      : null;

  const learnerTfStr =
    question.question_type === QuestionType.TrueFalse &&
    typedResponseFlat &&
    typeof typedResponseFlat.value === "boolean"
      ? typedResponseFlat.value
        ? "True"
        : "False"
      : "";

  const learnerPlainTextAnswer =
    (question.question_type === QuestionType.ShortAnswer ||
      question.question_type === QuestionType.Essay) &&
    typedResponseFlat &&
    typeof typedResponseFlat.text === "string"
      ? typedResponseFlat.text.trim()
      : "";

  const legacySingleFib =
    typeof responseText === "string" ? responseText.trim() : "";

  const blankOrder =
    question.question_type === QuestionType.FillInBlank
      ? listFillBlankUuidsForTaker(question)
      : [];

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface text-text-primary",
        "border-border/80 shadow-sm transition-shadow hover:shadow-md",
        cardClassName,
      )}
    >
      <div className="p-6 pt-0 space-y-4 pt-6 sm:pt-7">
        <div className="space-y-2">
          <div className="text-lg font-medium leading-relaxed">
            {promptEmpty ? (
              <span>Question</span>
            ) : (
              <QuizRichContentHtml value={promptValue} />
            )}
          </div>
          <p className="text-text-muted text-sm">
            Score:{" "}
            {inProgress
              ? "In progress"
              : formatQuizScorePair(answerScore, maxPoints)}
          </p>
        </div>

        {question.question_type === QuestionType.FillInBlank ? (
          <div className="space-y-6">
            {blankOrder.length > 0 ? (
              blankOrder.map((blankUuid, i) => {
                const slot =
                  findFillBlankSlotByBlankUuid(question, blankUuid) ??
                  fibSlots[i];
                const learner = (fibResponseMap[blankUuid] ?? "").trim();
                const slotChoices = slot
                  ? sortedFillBlankChoiceOptions(slot)
                  : [];
                const isChoiceSlot =
                  slot &&
                  getFillBlankSlotAnswerMode(slot) ===
                    FillBlankAnswerMode.SingleChoice &&
                  slotChoices.length > 0;
                return (
                  <div key={blankUuid} className="space-y-3">
                    <div>
                      <p className="text-text-muted text-sm">
                        Blank {i + 1} — their answer
                      </p>
                      <p className="mt-1 font-medium break-words">
                        {learner ? learner : "—"}
                      </p>
                    </div>
                    {isChoiceSlot ? (
                      <div>
                        <p className="text-text-muted text-sm">
                          Choices for this blank
                        </p>
                        <ul className="mt-2 list-none space-y-2">
                          {slotChoices.map((opt, oi) => {
                            const isCorrect = opt.is_correct === true;
                            const picked =
                              learner.length > 0 &&
                              opt.text.trim() === learner;
                            const wrongPick = picked && !isCorrect;
                            return (
                              <li
                                key={opt.id ?? `ch-${blankUuid}-${oi}`}
                                className={cn(
                                  "rounded-md border px-3 py-2 break-words",
                                  optionRowClass(isCorrect, wrongPick),
                                )}
                              >
                                {opt.text.trim() ? opt.text : "—"}
                                {isCorrect ? (
                                  <span className="text-text-muted ml-2 text-xs">
                                    (correct)
                                  </span>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : slot?.acceptable_answers &&
                      slot.acceptable_answers.length > 0 ? (
                      <div>
                        <p className="text-text-muted text-sm">
                          Accepted answers for this blank
                        </p>
                        <ul className="mt-2 list-disc space-y-2 pl-5">
                          {slot.acceptable_answers.map((a, ai) => (
                            <li
                              key={a.id ?? `acc-${blankUuid}-${ai}`}
                              className="break-words"
                            >
                              {acceptableAnswerToPlainText(a.body) || "—"}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div>
                <p className="text-text-muted text-sm">Their answer</p>
                <p className="mt-1 font-medium break-words">
                  {legacySingleFib ? legacySingleFib : "—"}
                </p>
              </div>
            )}
            {blankOrder.length === 0 && options.length > 0 ? (
              <div>
                <p className="text-text-muted text-sm">
                  Accepted answers (legacy)
                </p>
                <ul className="mt-2 list-disc space-y-2 pl-5">
                  {options.map((o, oi) => (
                    <li key={o.id ?? `acc-${oi}`} className="break-words">
                      <QuizRichOptionContent body={o.body} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : question.question_type === QuestionType.SingleChoice ? (
          <RadioGroup
            value={
              selectedOptionIds[0] != null
                ? String(selectedOptionIds[0])
                : undefined
            }
            disabled
            className="space-y-2"
          >
            {options.map((o, oi) => {
              const isCorrect = o.is_correct === true;
              const isSel = o.id != null && selected.has(o.id);
              const wrongPick = isSel && !isCorrect;
              return (
                <div
                  key={o.id ?? `opt-${oi}`}
                  className={cn(
                    "flex items-start gap-2 rounded-md border p-3",
                    optionRowClass(isCorrect, wrongPick),
                  )}
                >
                  <Radio
                    value={String(o.id)}
                    id={`review-opt-${qid}-${o.id}`}
                    className="mt-1"
                    disabled
                  />
                  <label
                    htmlFor={`review-opt-${qid}-${o.id}`}
                    className="cursor-default font-normal leading-snug text-text-primary"
                  >
                    <QuizRichOptionContent body={o.body} />
                  </label>
                </div>
              );
            })}
          </RadioGroup>
        ) : question.question_type === QuestionType.MultipleChoice ? (
          <div className="space-y-2">
            {options.map((o, oi) => {
              const isCorrect = o.is_correct === true;
              const isSel = o.id != null && selected.has(o.id);
              const wrongPick = isSel && !isCorrect;
              return (
                <div
                  key={o.id ?? `opt-${oi}`}
                  className={cn(
                    "flex items-start gap-2 rounded-md border p-3",
                    optionRowClass(isCorrect, wrongPick),
                  )}
                >
                  <Checkbox
                    id={`review-cb-${o.id}`}
                    className="mt-1"
                    checked={isSel}
                    disabled
                  />
                  <label
                    htmlFor={`review-cb-${o.id}`}
                    className="cursor-default font-normal leading-snug text-text-primary"
                  >
                    <QuizRichOptionContent body={o.body} />
                  </label>
                </div>
              );
            })}
          </div>
        ) : question.question_type === QuestionType.TrueFalse ? (
          <div className="space-y-4">
            <div>
              <p className="text-text-muted text-sm">Their answer</p>
              <p className="mt-1 font-medium break-words">
                {learnerTfStr || "—"}
              </p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Keyed answer</p>
              <p className="mt-1 font-medium break-words">
                {question.correct_true === true || question.correct_true === false
                  ? question.correct_true
                    ? "True"
                    : "False"
                  : "—"}
              </p>
            </div>
          </div>
        ) : question.question_type === QuestionType.ShortAnswer ? (
          <div className="space-y-4">
            <div>
              <p className="text-text-muted text-sm">Their answer</p>
              <p className="mt-1 whitespace-pre-wrap font-medium break-words">
                {learnerPlainTextAnswer ? learnerPlainTextAnswer : "—"}
              </p>
            </div>
            {(question.short_answer_acceptables?.length ?? 0) > 0 ? (
              <div>
                <p className="text-text-muted text-sm">Accepted wording</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {(question.short_answer_acceptables ?? []).map((row, ri) => (
                    <li key={row.id ?? `sa-${ri}`} className="break-words">
                      {String(row.body ?? "").trim() || "—"}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : question.question_type === QuestionType.Essay ? (
          <div className="space-y-4">
            <div>
              <p className="text-text-muted text-sm">Their answer</p>
              <p className="mt-1 whitespace-pre-wrap font-medium break-words">
                {learnerPlainTextAnswer ? learnerPlainTextAnswer : "—"}
              </p>
            </div>
            {!isQuizV3TiptapDocEmpty(essayFeedbackDoc) ? (
              <div>
                <p className="text-text-muted text-sm">Instructor feedback</p>
                <div className="mt-2 rounded-md border bg-surface-sunken/20 p-3">
                  <QuizRichContentHtml value={essayFeedbackDoc} />
                </div>
              </div>
            ) : null}
            {(essayComments?.length ?? 0) > 0 ? (
              <div>
                <p className="text-text-muted text-sm">Inline notes</p>
                <ul className="mt-2 list-none space-y-2">
                  {(essayComments ?? []).map((c, i) => (
                    <li
                      key={`${c.anchor_start}-${c.anchor_end}-${i}`}
                      className="rounded-md border px-3 py-2 text-sm"
                    >
                      <p className="text-text-muted text-xs">
                        Highlight characters {c.anchor_start}–{c.anchor_end}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words">{c.body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-text-muted text-sm">
            Unable to render this question type here.
          </p>
        )}
      </div>
    </div>
  );
}
