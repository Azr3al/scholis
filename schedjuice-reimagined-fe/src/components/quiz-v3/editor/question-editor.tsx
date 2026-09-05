"use client";
import { Button, Input, Radio, RadioGroup, Switch } from "@/components/primitives";

import { acceptableAnswerToPlainText } from "@/helpers/quizFillBlankAcceptableText";
import { mergeFillBlankSlotsWithPrompt } from "@/helpers/quizFillBlankSync";
import {
  getFillBlankSlotAnswerMode,
  sortedFillBlankChoiceOptions,
} from "@/helpers/quizFillBlankSlotMode";
import {
  FillBlankAnswerMode,
  QuestionType,
  type QuestionTypeV3,
} from "@/types/quiz-v3";
import { Plus, Trash as Trash2 } from "iconoir-react";
import { useMemo } from "react";
import {
  flattenDrfMessages,
  fillBlankSlotErrors,
  optionIndexToMessages,
  QUESTION_DETAIL_KEYS_HANDLED_INLINE,
  questionFieldLabel,
  shortAnswerRowMessages,
} from "@/helpers/quiz-editor-sync-error";
import { FillBlankPromptExcerpt } from "./fill-blank-prompt-excerpt";
import { OptionEditor } from "./option-editor";
import { QuizPromptRichText } from "./quiz-rich-text-editor";

export enum QuizEditorQuestionsAutosaveBanner {
  Hidden = "hidden",
  Saving = "saving",
  Saved = "saved",
}

const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  [QuestionType.SingleChoice]: "Single choice",
  [QuestionType.MultipleChoice]: "Multiple choice",
  [QuestionType.FillInBlank]: "Fill in the blank",
  [QuestionType.TrueFalse]: "True / False",
  [QuestionType.ShortAnswer]: "Short answer",
  [QuestionType.Essay]: "Essay",
};

export type FillBlankEditorActions = {
  addAcceptable: (slotIndex: number) => void;
  updateSlotPoints: (slotIndex: number, points: number) => void;
  updateAcceptable: (
    slotIndex: number,
    answerIndex: number,
    patch: Partial<QuestionTypeV3["options"][number]>,
  ) => void;
  removeAcceptable: (slotIndex: number, answerIndex: number) => void;
  setSlotAnswerMode: (slotIndex: number, mode: FillBlankAnswerMode) => void;
  updateChoiceOption: (
    slotIndex: number,
    optionIndex: number,
    patch: { text?: string; is_correct?: boolean },
  ) => void;
  addChoiceOption: (slotIndex: number) => void;
  removeChoiceOption: (slotIndex: number, optionIndex: number) => void;
  setCorrectChoice: (slotIndex: number, optionIndex: number) => void;
};

type Props = {
  quizId: number;
  /** Increment/decrement while a quiz image upload is in flight (disables Save). */
  onQuizImagePendingDelta: (delta: number) => void;
  question: QuestionTypeV3;
  index: number;
  onChange: (q: QuestionTypeV3) => void;
  onAddOption: () => void;
  onUpdateOption: (
    optionIndex: number,
    patch: Partial<QuestionTypeV3["options"][number]>,
  ) => void;
  onRemoveOption: (optionIndex: number) => void;
  onSetCorrectSingle: (optionIndex: number) => void;
  onToggleCorrectMulti: (optionIndex: number) => void;
  onTogglePartial: () => void;
  fillBlank?: FillBlankEditorActions;
  onSave: () => void;
  onSaveAndAddNext: () => void;
  isSaving: boolean;
  saveDisabled: boolean;
  /** Subtle copy beside Save when debounced question autosave runs. */
  questionsAutosaveBanner?: QuizEditorQuestionsAutosaveBanner;
  /** True while a prompt/option image is still uploading (Save and add next waits). */
  imageUploadsPending: boolean;
  /** True while a reorder save is in flight (disables Save and add next). */
  reorderSyncPending?: boolean;
  questionSyncDetails?: Record<string, unknown>;
  onClearQuestionSyncErrors?: () => void;
};

function wrapFillBlankActions(
  fb: FillBlankEditorActions,
  onClear?: () => void,
): FillBlankEditorActions {
  const wrap =
    <Args extends unknown[], R>(fn: (...args: Args) => R) =>
    (...args: Args): R => {
      onClear?.();
      return fn(...args);
    };
  return {
    addAcceptable: wrap(fb.addAcceptable),
    updateSlotPoints: wrap(fb.updateSlotPoints),
    updateAcceptable: wrap(fb.updateAcceptable),
    removeAcceptable: wrap(fb.removeAcceptable),
    setSlotAnswerMode: wrap(fb.setSlotAnswerMode),
    updateChoiceOption: wrap(fb.updateChoiceOption),
    addChoiceOption: wrap(fb.addChoiceOption),
    removeChoiceOption: wrap(fb.removeChoiceOption),
    setCorrectChoice: wrap(fb.setCorrectChoice),
  };
}

export function QuestionEditor({
  quizId,
  onQuizImagePendingDelta,
  question,
  index,
  onChange,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
  onSetCorrectSingle,
  onToggleCorrectMulti,
  onTogglePartial,
  fillBlank,
  onSave,
  onSaveAndAddNext,
  isSaving,
  saveDisabled,
  questionsAutosaveBanner = QuizEditorQuestionsAutosaveBanner.Hidden,
  imageUploadsPending,
  reorderSyncPending = false,
  questionSyncDetails,
  onClearQuestionSyncErrors,
}: Props) {
  const radioName = `q-${index}-correct`;
  const isFillInBlank = question.question_type === QuestionType.FillInBlank;
  const isMcSc =
    question.question_type === QuestionType.SingleChoice ||
    question.question_type === QuestionType.MultipleChoice;
  const typeTitle = QUESTION_TYPE_LABEL[question.question_type];
  const slots = question.fill_blank_slots ?? [];

  const syncDerived = useMemo(() => {
    const sync = questionSyncDetails;
    if (!sync) {
      return {
        topSummaries: [] as string[],
        bodyMsgs: [] as string[],
        pointsMsgs: [] as string[],
        correctTrueMsgs: [] as string[],
        shortAnswerRowMsgs: new Map<number, string[]>(),
        optMap: new Map<number, string[]>(),
        fibBySlot: new Map<number, string[]>(),
      };
    }
    const nf = flattenDrfMessages(sync.non_field_errors);
    const extraLines = Object.entries(sync)
      .filter(([k]) => !QUESTION_DETAIL_KEYS_HANDLED_INLINE.has(k))
      .flatMap(([k, v]) =>
        flattenDrfMessages(v).map((m) => `${questionFieldLabel(k)}: ${m}`),
      );
    const optionsRaw = sync.options;
    const optionsGlobal =
      sync.options !== undefined && !Array.isArray(optionsRaw)
        ? flattenDrfMessages(optionsRaw)
        : [];
    const { global: fibGlobal, bySlot: fibBySlot } = fillBlankSlotErrors(sync);
    const saMap = shortAnswerRowMessages(sync);
    const saLines = Array.from(saMap.entries()).flatMap(([idx, msgs]) =>
      msgs.map(
        (m) =>
          `${questionFieldLabel("short_answer_acceptables")} ${idx + 1}: ${m}`,
      ),
    );
    const topSummaries = [
      ...nf,
      ...extraLines,
      ...optionsGlobal,
      ...fibGlobal,
      ...saLines,
    ];
    return {
      topSummaries,
      bodyMsgs: flattenDrfMessages(sync.body),
      pointsMsgs: flattenDrfMessages(sync.points),
      correctTrueMsgs: flattenDrfMessages(sync.correct_true),
      shortAnswerRowMsgs: saMap,
      optMap: optionIndexToMessages(sync),
      fibBySlot,
    };
  }, [questionSyncDetails]);

  const fillBlankActions = useMemo(() => {
    if (!fillBlank) return undefined;
    return wrapFillBlankActions(fillBlank, onClearQuestionSyncErrors);
  }, [fillBlank, onClearQuestionSyncErrors]);

  let autosaveLine: string | null = null;
  if (questionsAutosaveBanner === QuizEditorQuestionsAutosaveBanner.Saving) {
    autosaveLine = "Saving…";
  } else if (questionsAutosaveBanner === QuizEditorQuestionsAutosaveBanner.Saved) {
    autosaveLine = "Saved";
  }

  const syncSummaryErrorsId =
    syncDerived.topSummaries.length > 0
      ? `q-${index}-sync-summary-errors`
      : undefined;

  return (
    <div className="rounded-lg border border-border bg-surface text-text-primary">
      <div className="flex flex-col gap-1.5 p-6 pb-2">
        <h3 className="font-serif text-xl leading-none tracking-tight text-base font-medium">
          {typeTitle}{" "}
          <span className="text-text-muted font-normal">question</span>
        </h3>
      </div>
      <div className="p-6 pt-0 space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label id={`q-${index}-prompt-label`}>Prompt</label>
            <QuizPromptRichText
              key={`prompt-${question.id ?? question.client_id ?? `i-${index}`}`}
              body={question.body}
              onChange={(patch) => {
                onClearQuestionSyncErrors?.();
                if (isFillInBlank) {
                  onChange(
                    mergeFillBlankSlotsWithPrompt(
                      question,
                      patch.body,
                      patch.body_plaintext,
                    ),
                  );
                } else {
                  onChange({ ...question, ...patch });
                }
              }}
              quizId={quizId}
              onImageUploadPendingDelta={onQuizImagePendingDelta}
              enableFillBlank={isFillInBlank}
            />
            {syncDerived.bodyMsgs.length > 0 ? (
              <p className="text-danger text-sm leading-snug" role="alert">
                {syncDerived.bodyMsgs.join(" ")}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <label htmlFor={`q-${index}-points`}>
              {isFillInBlank ? "Total points" : "Points"}
            </label>
            {isFillInBlank ? (
              <p
                id={`q-${index}-points`}
                className="rounded-md border border-border bg-surface-sunken/20 px-3 py-2 text-sm"
              >
                {question.points}
              </p>
            ) : (
              <Input
                id={`q-${index}-points`}
                type="number"
                min={1}
                value={question.points}
                onChange={(e) => {
                  onClearQuestionSyncErrors?.();
                  onChange({
                    ...question,
                    points: Math.max(1, Number(e.target.value) || 1),
                  });
                }}
              />
            )}
          </div>
          {syncDerived.pointsMsgs.length > 0 ? (
            <p
              className="text-danger text-sm leading-snug sm:col-span-2"
              role="alert"
            >
              {syncDerived.pointsMsgs.join(" ")}
            </p>
          ) : null}
        </div>

        {question.question_type === QuestionType.MultipleChoice && (
          <div className="flex items-center gap-2">
            <Switch
              id={`q-${index}-partial`}
              checked={!!question.is_partial_scoring_enabled}
              onCheckedChange={() => {
                onClearQuestionSyncErrors?.();
                onTogglePartial();
              }}
            />
            <label htmlFor={`q-${index}-partial`} className="cursor-pointer">
              Partial scoring (wrong selections reduce credit)
            </label>
          </div>
        )}

        {question.question_type === QuestionType.TrueFalse && (
          <div className="space-y-3">
            <label
              id={`q-${index}-tf-keyed-legend`}
              className="text-sm font-medium leading-none text-text-primary"
            >
              Keyed answer 
            </label>
            <RadioGroup
              aria-labelledby={`q-${index}-tf-keyed-legend`}
              value={
                question.correct_true === true
                  ? "true"
                  : question.correct_true === false
                    ? "false"
                    : undefined
              }
              onValueChange={(v: string) => {
                onClearQuestionSyncErrors?.();
                onChange({
                  ...question,
                  correct_true: v === "true",
                });
              }}
              className="flex max-w-md flex-col gap-1"
            >
              <div className="flex min-h-11 items-center gap-1">
                <Radio
                  value="true"
                  id={`q-${index}-tf-true`}
                  className="shrink-0"
                />
                <label
                  htmlFor={`q-${index}-tf-true`}
                  className="cursor-pointer text-sm font-normal leading-snug"
                >
                  True
                </label>
              </div>
              <div className="flex min-h-11 items-center gap-1">
                <Radio
                  value="false"
                  id={`q-${index}-tf-false`}
                  className="shrink-0"
                />
                <label
                  htmlFor={`q-${index}-tf-false`}
                  className="cursor-pointer text-sm font-normal leading-snug"
                >
                  False
                </label>
              </div>
            </RadioGroup>
            {syncDerived.correctTrueMsgs.length > 0 ? (
              <p className="text-danger text-sm leading-snug" role="alert">
                {syncDerived.correctTrueMsgs.join(" ")}
              </p>
            ) : null}
          </div>
        )}

        {question.question_type === QuestionType.Essay && (
          <p className="text-text-muted text-sm leading-snug">
            Learners write a longer response. Review and adjust scores as needed after submission.
          </p>
        )}

        {isFillInBlank ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Switch
                id={`q-${index}-case`}
                checked={!!question.is_case_sensitive}
                onCheckedChange={(v) => {
                  onClearQuestionSyncErrors?.();
                  onChange({ ...question, is_case_sensitive: v });
                }}
              />
              <label htmlFor={`q-${index}-case`} className="cursor-pointer">
                Case-sensitive matching (after trimming spaces)
              </label>
            </div>
            <p className="text-text-muted pl-11 text-xs leading-snug">
              Applies only to blanks that use typed answers.
            </p>
          </div>
        ) : null}

        <div className="space-y-4">
          {isFillInBlank && fillBlankActions ? (
            <>
              <label className="block">Blanks and answers</label>
              {slots.map((slot, si) => {
                const excerptId = `q-${index}-fib-${si}-excerpt`;
                return (
                  <div
                    key={slot.blank_uuid ?? `slot-${si}`}
                    className="space-y-4 rounded-lg bg-surface-sunken/25 p-4 dark:bg-surface-sunken/10"
                    aria-describedby={excerptId}
                  >
                    {(syncDerived.fibBySlot.get(si) ?? []).length > 0 ? (
                      <p
                        className="text-danger text-sm leading-snug"
                        role="alert"
                      >
                        {(syncDerived.fibBySlot.get(si) ?? []).join(" ")}
                      </p>
                    ) : null}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                      <div className="min-w-0 space-y-1.5">
                        <label className="text-text-primary">
                          Blank {si + 1}
                        </label>
                        <FillBlankPromptExcerpt
                          body={question.body}
                          blankUuid={slot.blank_uuid}
                          excerptId={excerptId}
                        />
                      </div>
                      <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">
                        <label
                          htmlFor={`q-${index}-slot-${si}-pts`}
                          className="text-text-muted mb-0 whitespace-nowrap text-sm font-normal"
                        >
                          Points
                        </label>
                        <Input
                          id={`q-${index}-slot-${si}-pts`}
                          type="number"
                          min={1}
                          className="h-9 w-[4.5rem] tabular-nums"
                          value={slot.points ?? 1}
                          onChange={(e) =>
                            fillBlankActions.updateSlotPoints(
                              si,
                              Math.max(1, Number(e.target.value) || 1),
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={
                          getFillBlankSlotAnswerMode(slot) ===
                          FillBlankAnswerMode.Typed
                            ? "primary"
                            : "secondary"
                        }
                        size="sm"
                        className="cursor-pointer"
                        onClick={() =>
                          fillBlankActions.setSlotAnswerMode(
                            si,
                            FillBlankAnswerMode.Typed,
                          )
                        }
                      >
                        Typed answer
                      </Button>
                      <Button
                        type="button"
                        variant={
                          getFillBlankSlotAnswerMode(slot) ===
                          FillBlankAnswerMode.SingleChoice
                            ? "primary"
                            : "secondary"
                        }
                        size="sm"
                        className="cursor-pointer"
                        onClick={() =>
                          fillBlankActions.setSlotAnswerMode(
                            si,
                            FillBlankAnswerMode.SingleChoice,
                          )
                        }
                      >
                        Single choice
                      </Button>
                    </div>

                    {getFillBlankSlotAnswerMode(slot) ===
                    FillBlankAnswerMode.Typed ? (
                      <>
                        <div className="space-y-3">
                          {(slot.acceptable_answers ?? []).map((ans, ai) => {
                            const aid = `q-${index}-fib-${si}-ans-${ai}`;
                            return (
                              <div key={ans.id ?? aid} className="space-y-1.5">
                                <label
                                  htmlFor={aid}
                                  className="text-sm font-medium text-text-primary"
                                >
                                  Acceptable answer {ai + 1}
                                </label>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                  <Input
                                    id={aid}
                                    value={acceptableAnswerToPlainText(
                                      ans.body,
                                    )}
                                    onChange={(e) =>
                                      fillBlankActions.updateAcceptable(si, ai, {
                                        body: e.target.value,
                                      })
                                    }
                                    placeholder="Accepted text"
                                    autoComplete="off"
                                    className="min-h-9 flex-1 bg-surface"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="shrink-0 cursor-pointer self-end sm:self-auto size-8 p-0"
                                    disabled={
                                      (slot.acceptable_answers?.length ?? 0) <=
                                      1
                                    }
                                    onClick={() =>
                                      fillBlankActions.removeAcceptable(si, ai)
                                    }
                                    aria-label="Remove acceptable answer"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto cursor-pointer gap-1 px-2 text-sm text-primary"
                            onClick={() => fillBlankActions.addAcceptable(si)}
                          >
                            <Plus className="size-4 shrink-0" aria-hidden />
                            Add acceptable answer for this blank
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <RadioGroup
                          value={String(
                            Math.max(
                              0,
                              sortedFillBlankChoiceOptions(slot).findIndex(
                                (o) => o.is_correct,
                              ),
                            ),
                          )}
                          onValueChange={(v: string) =>
                            fillBlankActions.setCorrectChoice(si, Number(v))
                          }
                          className="space-y-3"
                        >
                          {sortedFillBlankChoiceOptions(slot).map((opt, oi) => {
                            const oid = `q-${index}-fib-${si}-choice-${oi}`;
                            return (
                              <div
                                key={opt.id ?? oid}
                                className="flex flex-col gap-2 sm:flex-row sm:items-center"
                              >
                                <div className="flex min-w-0 flex-1 items-start gap-2">
                                  <Radio
                                    value={String(oi)}
                                    id={oid}
                                    className="mt-2.5 shrink-0"
                                  />
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <label
                                      htmlFor={oid}
                                      className="text-sm font-medium text-text-primary"
                                    >
                                      Choice {oi + 1}
                                      <span className="text-text-muted font-normal">
                                        {" "}
                                        (correct if selected)
                                      </span>
                                    </label>
                                    <Input
                                      value={opt.text}
                                      onChange={(e) =>
                                        fillBlankActions.updateChoiceOption(si, oi, {
                                          text: e.target.value,
                                        })
                                      }
                                      placeholder="Choice text"
                                      autoComplete="off"
                                      className="min-h-9 bg-surface"
                                    />
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="shrink-0 cursor-pointer self-end sm:self-auto size-8 p-0"
                                  disabled={
                                    sortedFillBlankChoiceOptions(slot)
                                      .length <= 2
                                  }
                                  onClick={() =>
                                    fillBlankActions.removeChoiceOption(si, oi)
                                  }
                                  aria-label="Remove choice"
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            );
                          })}
                        </RadioGroup>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto cursor-pointer gap-1 px-2 text-sm text-primary"
                            onClick={() => fillBlankActions.addChoiceOption(si)}
                          >
                            <Plus className="size-4 shrink-0" aria-hidden />
                            Add choice
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </>
          ) : question.question_type === QuestionType.ShortAnswer ? (
            <>

              {(question.short_answer_acceptables ?? []).map((row, ri) => {
                const aid = `q-${index}-sa-${ri}`;
                const rowErrs =
                  syncDerived.shortAnswerRowMsgs.get(ri) ?? [];
                return (
                  <div key={row.id ?? aid} className="space-y-1.5">
                    <label htmlFor={aid} className="text-sm font-medium">
                      Accepted wording {ri + 1}
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input
                        id={aid}
                        value={String(row.body ?? "")}
                        onChange={(e) => {
                          onClearQuestionSyncErrors?.();
                          const next = [...(question.short_answer_acceptables ?? [])];
                          next[ri] = {
                            ...row,
                            body: e.target.value,
                            display_order: ri,
                          };
                          onChange({
                            ...question,
                            short_answer_acceptables: next,
                          });
                        }}
                        placeholder="Accepted text"
                        autoComplete="off"
                        className="min-h-9 flex-1 bg-surface"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 cursor-pointer self-end sm:self-auto size-8 p-0"
                        disabled={
                          (question.short_answer_acceptables?.length ?? 0) <= 1
                        }
                        onClick={() => {
                          onClearQuestionSyncErrors?.();
                          onRemoveOption(ri);
                        }}
                        aria-label="Remove acceptable answer"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {rowErrs.length > 0 ? (
                      <p className="text-danger text-sm" role="alert">
                        {rowErrs.join(" ")}
                      </p>
                    ) : null}
                  </div>
                );
              })}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto cursor-pointer gap-1 px-2 text-sm text-primary"
                  onClick={() => {
                    onClearQuestionSyncErrors?.();
                    onAddOption();
                  }}
                >
                  <Plus className="size-4 shrink-0" aria-hidden />
                  Add acceptable answer
                </Button>
              </div>
            </>
          ) : isMcSc ? (
            <>
              <div className="space-y-1.5">
                <label>Options</label>
                <p className="text-text-muted text-sm leading-snug">
                  Each answer is edited in its own box below — click inside a box
                  to change the text or formatting.
                </p>
              </div>
              {question.options.map((opt, oi) => (
                <OptionEditor
                  key={
                    opt.id ?? `${question.id ?? question.client_id ?? "q"}-opt-${oi}`
                  }
                  questionType={question.question_type}
                  optionIndex={oi}
                  radioGroupName={radioName}
                  body={opt.body}
                  isCorrect={!!opt.is_correct}
                  richTextKey={`${question.id ?? question.client_id ?? "new"}-opt-${oi}`}
                  quizId={quizId}
                  onImageUploadPendingDelta={onQuizImagePendingDelta}
                  serverErrorMessages={syncDerived.optMap.get(oi)}
                  onBodyChange={(v) => {
                    onClearQuestionSyncErrors?.();
                    onUpdateOption(oi, { body: v });
                  }}
                  onMarkCorrect={() => {
                    onClearQuestionSyncErrors?.();
                    if (question.question_type === QuestionType.SingleChoice) {
                      onSetCorrectSingle(oi);
                    } else if (
                      question.question_type === QuestionType.MultipleChoice
                    ) {
                      onToggleCorrectMulti(oi);
                    }
                  }}
                  onRemove={() => {
                    onClearQuestionSyncErrors?.();
                    onRemoveOption(oi);
                  }}
                  canRemove={question.options.length > 1}
                />
              ))}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto cursor-pointer gap-1 px-2 text-sm text-primary"
                  onClick={() => {
                    onClearQuestionSyncErrors?.();
                    onAddOption();
                  }}
                >
                  <Plus className="size-4 shrink-0" aria-hidden />
                  Add option
                </Button>
              </div>
            </>
          ) : null}
        </div>

        <div className="space-y-3 border-t pt-4">
          {syncDerived.topSummaries.length > 0 ? (
            <div
              className="rounded-md border border-destructive/40 bg-danger/5 px-3 py-2 text-sm text-danger"
              role="alert"
              aria-live="polite"
              id={`q-${index}-sync-summary-errors`}
            >
              <ul className="list-disc space-y-0.5 pl-4">
                {syncDerived.topSummaries.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-text-muted min-h-[1.25rem] text-xs tabular-nums">
              {autosaveLine ?? "\u00a0"}
            </span>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                className="cursor-pointer"
                isLoading={isSaving}
                disabled={saveDisabled}
                onClick={onSave}
                aria-describedby={syncSummaryErrorsId}
              >
                Save
              </Button>
              <Button
                type="button"
                className="cursor-pointer"
                isLoading={isSaving}
                disabled={
                  isSaving || imageUploadsPending || reorderSyncPending
                }
                onClick={onSaveAndAddNext}
                aria-describedby={syncSummaryErrorsId}
              >
                Save and add next
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
