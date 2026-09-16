import * as z from "zod";

export enum QuizStatus {
  Draft = "draft",
  Open = "open",
  Closed = "closed",
}

/** Learner theme presets (must match `Quiz.QuizTheme` in backend). */
export enum QuizThemeV3 {
  Slate = "slate",
  Forest = "forest",
  Ocean = "ocean",
  Plum = "plum",
  Amber = "amber",
  HighContrast = "high_contrast",
}

export enum QuestionType {
  SingleChoice = "SINGLE_CHOICE",
  MultipleChoice = "MULTIPLE_CHOICE",
  FillInBlank = "FILL_IN_BLANK",
  TrueFalse = "TRUE_FALSE",
  ShortAnswer = "SHORT_ANSWER",
  Essay = "ESSAY",
}

/** Per-blank answer style for fill-in-the-blank questions. */
export enum FillBlankAnswerMode {
  Typed = "typed",
  SingleChoice = "single_choice",
}

export const quizCategorySchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const questionOptionSchema = z.object({
  id: z.number().optional(),
  /** TipTap JSON doc (object) or legacy string. */
  body: z.unknown(),
  /** Server-derived plain text; required non-empty on save (matches backend). */
  body_plaintext: z.string().optional(),
  is_correct: z.boolean().optional(),
  display_order: z.number().optional(),
});

export const fillBlankAcceptableAnswerSchema = z.object({
  id: z.number().optional(),
  body: z.unknown(),
  display_order: z.number().optional(),
});

export const fillBlankChoiceOptionSchema = z.object({
  id: z.number().optional(),
  text: z.string(),
  is_correct: z.boolean().optional(),
  display_order: z.number().optional(),
});

export const shortAnswerAcceptableSchema = z.object({
  id: z.number().optional(),
  /** Plain-text acceptable answer row (matches `QuestionShortAnswerAcceptableAnswer.body`). */
  body: z.string(),
  display_order: z.number().optional(),
});

export const fillBlankSlotSchema = z
  .object({
    id: z.number().optional(),
    blank_uuid: z.string(),
    points: z.number().min(1).optional(),
    display_order: z.number().optional(),
    answer_mode: z.nativeEnum(FillBlankAnswerMode).optional(),
    /** Server timestamps for last save per branch (editor-sync / detail). */
    typed_config_at: z.string().nullable().optional(),
    single_choice_config_at: z.string().nullable().optional(),
    /** Plain-text choices when `answer_mode` is single_choice. */
    choice_options: z.array(fillBlankChoiceOptionSchema).optional(),
    /** Omitted on learner-facing payloads (take API). */
    acceptable_answers: z.array(fillBlankAcceptableAnswerSchema).optional(),
  })
  .passthrough();

export const questionSchema = z
  .object({
    id: z.number().optional(),
    /** Client-only stable key for unsaved questions (not sent to API). */
    client_id: z.string().optional(),
    quiz: z.number().optional(),
    question_type: z.nativeEnum(QuestionType),
    body: z.unknown(),
    body_plaintext: z.string().optional(),
    points: z.number().min(1),
    display_order: z.number().optional(),
    is_partial_scoring_enabled: z.boolean().optional(),
    /** When false (default), blank answers are matched case-insensitively after trimming. */
    is_case_sensitive: z.boolean().optional().default(false),
    /** Editor / staff detail only; stripped on learner take payloads. */
    correct_true: z.boolean().nullable().optional(),
    options: z.array(questionOptionSchema),
    fill_blank_slots: z.array(fillBlankSlotSchema).optional(),
    short_answer_acceptables: z.array(shortAnswerAcceptableSchema).optional(),
    /** Staff-only explanation shown after grading (TipTap JSON). */
    explanation_body: z.unknown().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.question_type === QuestionType.FillInBlank) {
      const slots = data.fill_blank_slots;
      if (!slots?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one blank slot is required.",
          path: ["fill_blank_slots"],
        });
        return;
      }
      if (slots.every((s) => s.points != null)) {
        const sum = slots.reduce((s, x) => s + (x.points ?? 0), 0);
        if (sum !== data.points) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Points must equal the sum of blank points.",
            path: ["points"],
          });
        }
      }
      return;
    }
    if (data.question_type === QuestionType.TrueFalse) {
      if (data.correct_true !== true && data.correct_true !== false) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Choose True or False as the keyed answer.",
          path: ["correct_true"],
        });
      }
      return;
    }
    if (data.question_type === QuestionType.ShortAnswer) {
      const rows = data.short_answer_acceptables ?? [];
      if (rows.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Add at least one acceptable answer.",
          path: ["short_answer_acceptables"],
        });
      }
      rows.forEach((row, i) => {
        if (!String(row.body ?? "").trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Enter text for every acceptable answer.",
            path: ["short_answer_acceptables", i, "body"],
          });
        }
      });
      return;
    }
    if (
      data.question_type === QuestionType.Essay ||
      data.question_type === QuestionType.SingleChoice ||
      data.question_type === QuestionType.MultipleChoice
    ) {
      if (
        data.question_type === QuestionType.SingleChoice ||
        data.question_type === QuestionType.MultipleChoice
      ) {
        if (data.options.length < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "At least two choices are required.",
            path: ["options"],
          });
        }
      }
      return;
    }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unsupported question type.",
      path: ["question_type"],
    });
  });

/** Expanded user from API when `expand=created_by` is used. */
export const quizCreatedBySchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().nullable().optional(),
});

/** Present on `courses/:id/assessments` quiz rows for learners only (null for teachers). */
export const learnerQuizSummarySchema = z.object({
  completed_attempts: z.number(),
  max_attempts: z.number(),
  has_in_progress_attempt: z.boolean(),
  may_submit_new_attempt: z.boolean(),
  attempts_exhausted_message: z.string().nullable().optional(),
  /** Essay quizzes: learner only sees the released attempt in past work. */
  has_released_result: z.boolean().optional(),
  released_attempt_id: z.number().nullable().optional(),
});

export type LearnerQuizSummary = z.infer<typeof learnerQuizSummarySchema>;

/** Learner-facing answer payloads for autosave/submit (`answers` map values). */
export type QuizTakeAnswerWire =
  | number[]
  | Record<string, string>
  | { value: boolean }
  | { text: string };

/** Server GET `quizzes/take/:code` saved answer map (subset of wire shapes). */
export type QuizTakeSavedAnswers = Record<string, QuizTakeAnswerWire>;

/** Saved progress hydrated on learner take payloads. */
export type QuizTakeProgressHydration = {
  saved_answers?: QuizTakeSavedAnswers;
  /** Only `true` keys are returned; missing implies false on the client. */
  saved_marked_review?: Record<string, boolean>;
};

export const quizSchema = z.object({
  id: z.number(),
  title: z.string(),
  status: z.nativeEnum(QuizStatus),
  code: z.string(),
  version: z.number(),
  can_show_answers_afterwards: z.boolean(),
  can_navigate_questions: z.boolean().default(false),
  max_retakes: z.number(),
  allowed_minutes: z.number(),
  activation_date: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  category: z.number().nullable().optional(),
  /** FK id, or expanded course object when `expand=course`. */
  course: z
    .union([
      z.number(),
      z
        .object({
          id: z.number(),
          title: z.string().optional(),
        })
        .passthrough(),
    ])
    .nullable()
    .optional(),
  created_by: z.union([z.number(), quizCreatedBySchema]).optional(),
  questions: z.array(questionSchema).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  submission_count: z.number().optional(),
  unique_respondent_count: z.number().optional(),
  total_questions: z.number().optional(),
  learner_quiz: learnerQuizSummarySchema.nullable().optional(),
  intro_body: z.unknown().optional(),
  outro_body: z.unknown().optional(),
  quiz_theme: z.nativeEnum(QuizThemeV3).catch(QuizThemeV3.Slate),
  has_essay_questions: z.boolean().optional(),
});

export const quizCreateSchema = z.object({
  title: z.string().min(1, "Title is required"),
  status: z.nativeEnum(QuizStatus).default(QuizStatus.Draft),
  can_show_answers_afterwards: z.boolean().default(false),
  can_navigate_questions: z.boolean().default(false),
  max_retakes: z.coerce.number().min(1).default(3),
  allowed_minutes: z.coerce.number().min(1).default(60),
  activation_date: z.string().optional().nullable(),
  expiry_date: z.string().optional().nullable(),
  category: z.preprocess(
    (val) =>
      val === null || val === undefined || val === ""
        ? undefined
        : Number(val),
    z.number({
      required_error: "Select a category",
      invalid_type_error: "Select a category",
    }),
  ),
  course: z.number().nullable().optional(),
});

export type QuizCategoryType = z.infer<typeof quizCategorySchema>;
export type QuestionOptionType = z.infer<typeof questionOptionSchema>;
export type ShortAnswerAcceptableType = z.infer<typeof shortAnswerAcceptableSchema>;
export type FillBlankChoiceOptionType = z.infer<typeof fillBlankChoiceOptionSchema>;
export type FillBlankSlotType = z.infer<typeof fillBlankSlotSchema>;
export type QuestionTypeV3 = z.infer<typeof questionSchema>;
export type QuizTypeV3 = z.infer<typeof quizSchema>;

export const quizAttemptSchema = z.object({
  id: z.number(),
  quiz: z.number(),
  user: z
    .union([
      z.number(),
      z
        .object({
          id: z.number(),
          name: z.string().optional(),
        })
        .passthrough(),
    ])
    .optional(),
  score: z.union([z.string(), z.number()]),
  max_score: z.number(),
  started_at: z.string(),
  submitted_at: z.string().nullable().optional(),
  overdue_seconds: z.number().optional().default(0),
  has_pending_essay_grading: z.boolean().optional(),
  is_released: z.boolean().optional(),
  released_at: z.string().nullable().optional(),
  essay_grading_waived_at: z.string().nullable().optional(),
  essay_grading_waived_by: z.number().nullable().optional(),
});

export const essayCommentSchema = z.object({
  id: z.number().optional(),
  anchor_start: z.number(),
  anchor_end: z.number(),
  body: z.string(),
  created_by: z.number().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type EssayCommentV3 = z.infer<typeof essayCommentSchema>;

export const attemptAnswerSchema = z.object({
  id: z.number(),
  attempt: z.number(),
  question: z.number(),
  marked_review: z.boolean().optional(),
  score: z.union([z.string(), z.number()]),
  selected_option_ids: z.array(z.number()),
  /**
   * Graded payloads: FiB map, legacy string, true/false (`value`), short/essay (`text`).
   */
  response_text: z
    .union([
      z.record(z.string(), z.string()),
      z.string(),
      z.object({ value: z.boolean() }),
      z.object({ text: z.string() }),
    ])
    .optional(),
  /** TipTap JSON shown to the learner after release (essay). */
  feedback: z.unknown().optional(),
  comments: z.array(essayCommentSchema).optional(),
  graded_by: z.number().nullable().optional(),
  graded_at: z.string().nullable().optional(),
});

/** Learner GET `quizzes/take/:code/attempts/:id` when `can_show_answers_afterwards` is false. */
export const learnerEssayFeedbackSummaryRowSchema = z.object({
  answer_id: z.number(),
  question_id: z.number(),
  feedback: z.unknown().optional(),
  comments: z.array(essayCommentSchema).optional(),
});

export const learnerAttemptSummarySchema = z.object({
  review_mode: z.literal("summary"),
  attempt_id: z.number(),
  quiz_title: z.string(),
  submitted_at: z.string(),
  score: z.string(),
  max_score: z.number(),
  overdue_seconds: z.number(),
  has_pending_essay_grading: z.boolean().optional().default(false),
  essay_feedback: z.array(learnerEssayFeedbackSummaryRowSchema).optional(),
});

export type LearnerAttemptSummary = z.infer<typeof learnerAttemptSummarySchema>;

/** Essay quiz submitted but staff has not released results yet. */
export const learnerAttemptAwaitingReleaseSchema = z.object({
  review_mode: z.literal("awaiting_release"),
  attempt_id: z.number(),
  submitted_at: z.string().nullable().optional(),
  overdue_seconds: z.number().optional(),
});

export type LearnerAttemptAwaitingRelease = z.infer<
  typeof learnerAttemptAwaitingReleaseSchema
>;
