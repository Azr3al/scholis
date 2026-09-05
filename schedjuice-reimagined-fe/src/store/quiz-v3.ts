import {
  FillBlankAnswerMode,
  QuestionType,
  type FillBlankChoiceOptionType,
  type FillBlankSlotType,
  type QuestionOptionType,
  type QuestionTypeV3,
  type QuizTypeV3,
} from "@/types/quiz-v3";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { v4 as uuid } from "uuid";

function defaultOption(): QuestionOptionType {
  return {
    body: { type: "doc", content: [] },
    is_correct: false,
    display_order: 0,
  };
}

function defaultFillBlankChoiceOptions(): FillBlankChoiceOptionType[] {
  return [
    { text: "", display_order: 0, is_correct: true },
    { text: "", display_order: 1, is_correct: false },
  ];
}

function defaultFillBlankSlot(blankUuid: string): FillBlankSlotType {
  return {
    blank_uuid: blankUuid,
    points: 1,
    display_order: 0,
    answer_mode: FillBlankAnswerMode.Typed,
    acceptable_answers: [
      { body: "", display_order: 0 },
      { body: "", display_order: 1 },
    ],
  };
}

export function defaultQuestion(qt: QuestionType): QuestionTypeV3 {
  if (qt === QuestionType.FillInBlank) {
    const bid = uuid();
    return {
      question_type: qt,
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "quizFillBlank",
                attrs: { blankId: bid },
              },
            ],
          },
        ],
      },
      body_plaintext: "",
      points: 1,
      display_order: 0,
      is_partial_scoring_enabled: false,
      is_case_sensitive: false,
      options: [],
      fill_blank_slots: [defaultFillBlankSlot(bid)],
    };
  }
  const baseChoices = (): QuestionOptionType[] => [
    { ...defaultOption(), body: "" },
    { ...defaultOption(), body: "" },
  ];
  if (qt === QuestionType.TrueFalse) {
    return {
      question_type: qt,
      body: { type: "doc", content: [] },
      body_plaintext: "",
      points: 1,
      display_order: 0,
      is_partial_scoring_enabled: false,
      is_case_sensitive: false,
      options: [],
      fill_blank_slots: undefined,
      correct_true: null,
    };
  }
  if (qt === QuestionType.ShortAnswer) {
    return {
      question_type: qt,
      body: { type: "doc", content: [] },
      body_plaintext: "",
      points: 1,
      display_order: 0,
      is_partial_scoring_enabled: false,
      is_case_sensitive: false,
      options: [],
      fill_blank_slots: undefined,
      short_answer_acceptables: [
        { body: "", display_order: 0 },
        { body: "", display_order: 1 },
      ],
    };
  }
  if (qt === QuestionType.Essay) {
    return {
      question_type: qt,
      body: { type: "doc", content: [] },
      body_plaintext: "",
      points: 1,
      display_order: 0,
      is_partial_scoring_enabled: false,
      is_case_sensitive: false,
      options: [],
      fill_blank_slots: undefined,
    };
  }
  return {
    question_type: qt,
    body: { type: "doc", content: [] },
    body_plaintext: "",
    points: 1,
    display_order: 0,
    is_partial_scoring_enabled: false,
    is_case_sensitive: false,
    fill_blank_slots: undefined,
    options: baseChoices(),
  };
}

interface QuizV3EditorStore {
  quiz: Partial<QuizTypeV3> | null;
  questions: QuestionTypeV3[];
  /** Unsaved changes to questions / options / order */
  isDirty: boolean;
  /** Unsaved changes to quiz metadata (title, schedule, etc.) */
  isMetaDirty: boolean;
  setFromApi: (quiz: QuizTypeV3, questions: QuestionTypeV3[]) => void;
  setQuizMeta: (patch: Partial<QuizTypeV3>) => void;
  clearMetaDirty: () => void;
  /** After a successful meta-only PATCH: apply server quiz fields without replacing local questions or content dirty state. */
  mergeQuizFromServer: (quiz: QuizTypeV3) => void;
  /** Update quiz metadata from a server snapshot but keep the current `questions` array and dirty flags (for refetch while editing content). */
  applyServerQuizMetaOnly: (quiz: QuizTypeV3) => void;
  /** After questions-only `editor-sync`: replace questions, clear question dirty, merge server quiz fields, preserve `isMetaDirty`. */
  applyQuestionsSyncFromServer: (
    questions: QuestionTypeV3[],
    quiz?: QuizTypeV3 | null,
  ) => void;
  /**
   * After full `editor-sync` for a snapshot of length N, merge server rows with any local
   * questions appended after that snapshot (e.g. optimistic "Save and add next").
   */
  applyServerSaveKeepingLocalTail: (
    quiz: QuizTypeV3,
    savedQuestions: QuestionTypeV3[],
  ) => void;
  updateQuestion: (index: number, q: QuestionTypeV3) => void;
  addQuestion: (qt: QuestionType) => void;
  setQuestionType: (index: number, qt: QuestionType) => void;
  removeQuestion: (index: number) => void;
  reorderQuestions: (ordered: QuestionTypeV3[]) => void;
  addOption: (questionIndex: number) => void;
  updateOption: (
    questionIndex: number,
    optionIndex: number,
    patch: Partial<QuestionOptionType>,
  ) => void;
  removeOption: (questionIndex: number, optionIndex: number) => void;
  setCorrectSingle: (questionIndex: number, optionIndex: number) => void;
  toggleCorrectMulti: (questionIndex: number, optionIndex: number) => void;
  togglePartialScoring: (questionIndex: number) => void;
  updateFillSlotPoints: (questionIndex: number, slotIndex: number, points: number) => void;
  updateFillAcceptableAnswer: (
    questionIndex: number,
    slotIndex: number,
    answerIndex: number,
    patch: { body?: QuestionOptionType["body"] },
  ) => void;
  removeFillAcceptableAnswer: (
    questionIndex: number,
    slotIndex: number,
    answerIndex: number,
  ) => void;
  addFillAcceptableAnswer: (questionIndex: number, slotIndex: number) => void;
  setFillBlankAnswerMode: (
    questionIndex: number,
    slotIndex: number,
    mode: FillBlankAnswerMode,
  ) => void;
  updateFillChoiceOption: (
    questionIndex: number,
    slotIndex: number,
    optionIndex: number,
    patch: Partial<Pick<FillBlankChoiceOptionType, "text" | "is_correct">>,
  ) => void;
  addFillChoiceOption: (questionIndex: number, slotIndex: number) => void;
  removeFillChoiceOption: (
    questionIndex: number,
    slotIndex: number,
    optionIndex: number,
  ) => void;
  setFillChoiceCorrect: (
    questionIndex: number,
    slotIndex: number,
    optionIndex: number,
  ) => void;
  setDirty: (v: boolean) => void;
  reset: () => void;
}

export const useQuizV3EditorStore = create(
  immer<QuizV3EditorStore>((set) => ({
    quiz: null,
    questions: [],
    isDirty: false,
    isMetaDirty: false,
    setFromApi: (quiz, questions) =>
      set((s) => {
        s.quiz = quiz;
        s.questions = questions;
        s.isDirty = false;
        s.isMetaDirty = false;
      }),
    setQuizMeta: (patch) =>
      set((s) => {
        s.quiz = { ...s.quiz, ...patch };
        s.isMetaDirty = true;
      }),
    clearMetaDirty: () =>
      set((s) => {
        s.isMetaDirty = false;
      }),
    mergeQuizFromServer: (quiz) =>
      set((s) => {
        const { questions: _drop, ...rest } = quiz;
        s.quiz = { ...s.quiz, ...rest };
        s.isMetaDirty = false;
      }),
    applyServerQuizMetaOnly: (quiz) =>
      set((s) => {
        const { questions: _drop, ...rest } = quiz;
        s.quiz = { ...s.quiz, ...rest };
      }),
    applyQuestionsSyncFromServer: (questions, quizMeta) =>
      set((s) => {
        s.questions = questions;
        s.isDirty = false;
        if (quizMeta && s.quiz) {
          const { questions: _drop, ...rest } = quizMeta;
          s.quiz = { ...s.quiz, ...rest };
        }
      }),
    applyServerSaveKeepingLocalTail: (quiz, savedQuestions) =>
      set((s) => {
        const n = savedQuestions.length;
        const local = s.questions.slice(n);
        s.questions = [...savedQuestions, ...local];
        const { questions: _drop, ...rest } = quiz;
        s.quiz = { ...s.quiz, ...rest };
        s.isMetaDirty = false;
        s.isDirty = local.length > 0;
      }),
    updateQuestion: (index, q) =>
      set((s) => {
        s.questions[index] = q;
        s.isDirty = true;
      }),
    addQuestion: (qt) =>
      set((s) => {
        s.questions.push({
          ...defaultQuestion(qt),
          id: undefined,
          client_id: uuid(),
        });
        s.isDirty = true;
      }),
    setQuestionType: (index, qt) =>
      set((s) => {
        const q = s.questions[index];
        if (!q || q.question_type === qt) return;

        const ensureMcOptions = (multi: boolean) => {
          if (!q.options || q.options.length < 2) {
            q.options = [
              { ...defaultOption(), body: "" },
              { ...defaultOption(), body: "" },
            ];
          }
          q.is_partial_scoring_enabled = multi ? !!q.is_partial_scoring_enabled : false;
          if (!multi) {
            const firstCorrect = q.options.findIndex((o) => o.is_correct);
            const keep = firstCorrect >= 0 ? firstCorrect : 0;
            q.options.forEach((o, i) => {
              o.is_correct = i === keep;
            });
          }
        };

        if (qt === QuestionType.FillInBlank) {
          q.question_type = QuestionType.FillInBlank;
          q.is_partial_scoring_enabled = false;
          q.is_case_sensitive = false;
          q.options = [];
          q.short_answer_acceptables = undefined;
          q.correct_true = undefined;
          const bid = uuid();
          q.body = {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "quizFillBlank", attrs: { blankId: bid } },
                ],
              },
            ],
          };
          q.body_plaintext = "";
          q.fill_blank_slots = [defaultFillBlankSlot(bid)];
          q.points = 1;
          s.isDirty = true;
          return;
        }

        q.fill_blank_slots = undefined;

        if (qt === QuestionType.TrueFalse) {
          q.question_type = QuestionType.TrueFalse;
          q.options = [];
          q.short_answer_acceptables = undefined;
          q.is_partial_scoring_enabled = false;
          q.is_case_sensitive = false;
          q.correct_true = null;
          s.isDirty = true;
          return;
        }

        if (qt === QuestionType.ShortAnswer) {
          q.question_type = QuestionType.ShortAnswer;
          q.options = [];
          q.correct_true = undefined;
          q.is_partial_scoring_enabled = false;
          q.is_case_sensitive = false;
          q.short_answer_acceptables = [
            { body: "", display_order: 0 },
            { body: "", display_order: 1 },
          ];
          s.isDirty = true;
          return;
        }

        if (qt === QuestionType.Essay) {
          q.question_type = QuestionType.Essay;
          q.options = [];
          q.short_answer_acceptables = undefined;
          q.correct_true = undefined;
          q.is_partial_scoring_enabled = false;
          q.is_case_sensitive = false;
          s.isDirty = true;
          return;
        }

        if (qt === QuestionType.MultipleChoice) {
          q.question_type = QuestionType.MultipleChoice;
          q.short_answer_acceptables = undefined;
          q.correct_true = undefined;
          ensureMcOptions(true);
          s.isDirty = true;
          return;
        }

        q.question_type = QuestionType.SingleChoice;
        q.short_answer_acceptables = undefined;
        q.correct_true = undefined;
        ensureMcOptions(false);
        s.isDirty = true;
      }),
    removeQuestion: (index) =>
      set((s) => {
        s.questions.splice(index, 1);
        s.isDirty = true;
      }),
    reorderQuestions: (ordered) =>
      set((s) => {
        s.questions = ordered.map((q, i) => ({ ...q, display_order: i }));
        s.isDirty = true;
      }),
    addOption: (questionIndex) =>
      set((s) => {
        const q = s.questions[questionIndex];
        if (!q) return;
        if (q.question_type === QuestionType.ShortAnswer) {
          const prev = q.short_answer_acceptables ?? [];
          q.short_answer_acceptables = [
            ...prev,
            { body: "", display_order: prev.length },
          ];
          s.isDirty = true;
          return;
        }
        if (
          q.question_type === QuestionType.TrueFalse ||
          q.question_type === QuestionType.Essay
        ) {
          return;
        }
        if (q.question_type === QuestionType.FillInBlank) {
          const slots = q.fill_blank_slots ?? [];
          if (slots.length === 0) return;
          const last = slots.length - 1;
          const slot = slots[last];
          const nextAns = [
            ...(slot.acceptable_answers ?? []),
            {
              body: "",
              display_order: slot.acceptable_answers?.length ?? 0,
            },
          ];
          const nextSlots = [...slots];
          nextSlots[last] = { ...slot, acceptable_answers: nextAns };
          q.fill_blank_slots = nextSlots;
        } else {
          const row = { ...defaultOption(), body: "" };
          q.options = [...q.options, row];
        }
        s.isDirty = true;
      }),
    updateOption: (questionIndex, optionIndex, patch) =>
      set((s) => {
        const q = s.questions[questionIndex];
        if (
          !q ||
          q.question_type === QuestionType.FillInBlank ||
          q.question_type === QuestionType.ShortAnswer ||
          q.question_type === QuestionType.TrueFalse ||
          q.question_type === QuestionType.Essay
        )
          return;
        if (!q.options[optionIndex]) return;
        q.options[optionIndex] = { ...q.options[optionIndex], ...patch };
        s.isDirty = true;
      }),
    removeOption: (questionIndex, optionIndex) =>
      set((s) => {
        const q = s.questions[questionIndex];
        if (!q || q.question_type === QuestionType.FillInBlank) return;
        if (q.question_type === QuestionType.ShortAnswer) {
          const rows = [...(q.short_answer_acceptables ?? [])];
          if (rows.length <= 1) return;
          rows.splice(optionIndex, 1);
          q.short_answer_acceptables = rows.map((r, i) => ({
            ...r,
            display_order: i,
          }));
          s.isDirty = true;
          return;
        }
        if (
          q.question_type === QuestionType.TrueFalse ||
          q.question_type === QuestionType.Essay
        ) {
          return;
        }
        if (q.options.length <= 1) return;
        q.options.splice(optionIndex, 1);
        s.isDirty = true;
      }),
    updateFillSlotPoints: (questionIndex, slotIndex, points) =>
      set((s) => {
        const q = s.questions[questionIndex];
        if (!q?.fill_blank_slots?.[slotIndex]) return;
        const slots = [...q.fill_blank_slots];
        const slot = { ...slots[slotIndex], points: Math.max(1, points) };
        slots[slotIndex] = slot;
        q.fill_blank_slots = slots;
        q.points = Math.max(1, slots.reduce((sum, sl) => sum + (sl.points ?? 1), 0));
        s.isDirty = true;
      }),
    updateFillAcceptableAnswer: (questionIndex, slotIndex, answerIndex, patch) =>
      set((s) => {
        const q = s.questions[questionIndex];
        const slot = q?.fill_blank_slots?.[slotIndex];
        const row = slot?.acceptable_answers?.[answerIndex];
        if (!q || !slot || !row) return;
        const slots = [...(q.fill_blank_slots ?? [])];
        const answers = [...(slot.acceptable_answers ?? [])];
        answers[answerIndex] = { ...row, ...patch };
        slots[slotIndex] = { ...slot, acceptable_answers: answers };
        q.fill_blank_slots = slots;
        s.isDirty = true;
      }),
    removeFillAcceptableAnswer: (questionIndex, slotIndex, answerIndex) =>
      set((s) => {
        const q = s.questions[questionIndex];
        const slot = q?.fill_blank_slots?.[slotIndex];
        if (!q || !slot || (slot.acceptable_answers?.length ?? 0) <= 1) return;
        const slots = [...(q.fill_blank_slots ?? [])];
        const answers = (slot.acceptable_answers ?? []).filter((_, i) => i !== answerIndex);
        slots[slotIndex] = { ...slot, acceptable_answers: answers };
        q.fill_blank_slots = slots;
        s.isDirty = true;
      }),
    addFillAcceptableAnswer: (questionIndex, slotIndex) =>
      set((s) => {
        const q = s.questions[questionIndex];
        const slot = q?.fill_blank_slots?.[slotIndex];
        if (!q || !slot) return;
        const slots = [...(q.fill_blank_slots ?? [])];
        const prev = slot.acceptable_answers ?? [];
        const nextAns = [
          ...prev,
          {
            body: "",
            display_order: prev.length,
          },
        ];
        slots[slotIndex] = { ...slot, acceptable_answers: nextAns };
        q.fill_blank_slots = slots;
        s.isDirty = true;
      }),
    setFillBlankAnswerMode: (questionIndex, slotIndex, mode) =>
      set((s) => {
        const q = s.questions[questionIndex];
        const slot = q?.fill_blank_slots?.[slotIndex];
        if (!q || !slot) return;
        const slots = [...(q.fill_blank_slots ?? [])];
        if (mode === FillBlankAnswerMode.SingleChoice) {
          const prevChoices = slot.choice_options ?? [];
          const choice_options =
            prevChoices.length >= 2
              ? prevChoices.map((o, i) => ({
                  ...o,
                  display_order: i,
                }))
              : defaultFillBlankChoiceOptions();
          const correctIdx = choice_options.findIndex((o) => o.is_correct);
          const fixed =
            correctIdx >= 0
              ? choice_options
              : choice_options.map((o, i) => ({
                  ...o,
                  is_correct: i === 0,
                }));
          slots[slotIndex] = {
            ...slot,
            answer_mode: FillBlankAnswerMode.SingleChoice,
            choice_options: fixed,
          };
        } else {
          const prevAcc = slot.acceptable_answers ?? [];
          const acceptable_answers =
            prevAcc.length > 0
              ? prevAcc
              : [
                  { body: "", display_order: 0 },
                  { body: "", display_order: 1 },
                ];
          slots[slotIndex] = {
            ...slot,
            answer_mode: FillBlankAnswerMode.Typed,
            acceptable_answers,
          };
        }
        q.fill_blank_slots = slots;
        s.isDirty = true;
      }),
    updateFillChoiceOption: (
      questionIndex,
      slotIndex,
      optionIndex,
      patch,
    ) =>
      set((s) => {
        const q = s.questions[questionIndex];
        const slot = q?.fill_blank_slots?.[slotIndex];
        const row = slot?.choice_options?.[optionIndex];
        if (!q || !slot || !row) return;
        const slots = [...(q.fill_blank_slots ?? [])];
        const opts = [...(slot.choice_options ?? [])];
        opts[optionIndex] = { ...row, ...patch };
        slots[slotIndex] = { ...slot, choice_options: opts };
        q.fill_blank_slots = slots;
        s.isDirty = true;
      }),
    addFillChoiceOption: (questionIndex, slotIndex) =>
      set((s) => {
        const q = s.questions[questionIndex];
        const slot = q?.fill_blank_slots?.[slotIndex];
        if (!q || !slot) return;
        const slots = [...(q.fill_blank_slots ?? [])];
        const prev = slot.choice_options ?? [];
        const next = [
          ...prev,
          {
            text: "",
            display_order: prev.length,
            is_correct: false,
          },
        ];
        slots[slotIndex] = { ...slot, choice_options: next };
        q.fill_blank_slots = slots;
        s.isDirty = true;
      }),
    removeFillChoiceOption: (questionIndex, slotIndex, optionIndex) =>
      set((s) => {
        const q = s.questions[questionIndex];
        const slot = q?.fill_blank_slots?.[slotIndex];
        if (!q || !slot || (slot.choice_options?.length ?? 0) <= 2) return;
        const slots = [...(q.fill_blank_slots ?? [])];
        const next = (slot.choice_options ?? []).filter(
          (_, i) => i !== optionIndex,
        );
        if (!next.some((o) => o.is_correct)) {
          next[0] = { ...next[0], is_correct: true };
        }
        slots[slotIndex] = {
          ...slot,
          choice_options: next.map((o, i) => ({ ...o, display_order: i })),
        };
        q.fill_blank_slots = slots;
        s.isDirty = true;
      }),
    setFillChoiceCorrect: (questionIndex, slotIndex, optionIndex) =>
      set((s) => {
        const q = s.questions[questionIndex];
        const slot = q?.fill_blank_slots?.[slotIndex];
        if (!q || !slot) return;
        const slots = [...(q.fill_blank_slots ?? [])];
        const opts = (slot.choice_options ?? []).map((o, i) => ({
          ...o,
          is_correct: i === optionIndex,
        }));
        slots[slotIndex] = { ...slot, choice_options: opts };
        q.fill_blank_slots = slots;
        s.isDirty = true;
      }),
    setCorrectSingle: (questionIndex, optionIndex) =>
      set((s) => {
        const q = s.questions[questionIndex];
        if (!q || q.question_type !== QuestionType.SingleChoice) return;
        q.options.forEach((o, i) => {
          o.is_correct = i === optionIndex;
        });
        s.isDirty = true;
      }),
    toggleCorrectMulti: (questionIndex, optionIndex) =>
      set((s) => {
        const q = s.questions[questionIndex];
        if (!q || q.question_type !== QuestionType.MultipleChoice) return;
        const o = q.options[optionIndex];
        if (o) o.is_correct = !o.is_correct;
        s.isDirty = true;
      }),
    togglePartialScoring: (questionIndex) =>
      set((s) => {
        const q = s.questions[questionIndex];
        if (!q || q.question_type !== QuestionType.MultipleChoice) return;
        q.is_partial_scoring_enabled = !q.is_partial_scoring_enabled;
        s.isDirty = true;
      }),
    setDirty: (v) =>
      set((s) => {
        s.isDirty = v;
      }),
    reset: () =>
      set((s) => {
        s.quiz = null;
        s.questions = [];
        s.isDirty = false;
        s.isMetaDirty = false;
      }),
  })),
);
