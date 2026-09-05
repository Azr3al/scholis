import * as z from "zod";

export const questionTypes = ["radio", "input", "paragraph", "file"] as const;
export const questiomTypeEnum = z.enum(questionTypes);

const inputQuestionSchema = z.object({
  id: z.string(), // unique id
  questionType: z.literal(questiomTypeEnum.enum.input),
  question: z.string(),
  description: z.string().optional(),
  answer: z.string().optional(), // the correct answer
  availableScore: z.number().optional(),
  isValid: z.boolean().default(true), // the question is valid to be saved (to be used during quiz-creation)
  configuration: z.object({
    isRegex: z.boolean(),
    isCaseSensitive: z.boolean(),
    trimWhitespace: z.boolean(),
    isEssay: z.boolean(),
  }),
});

const radioOptionSchema = z.object({
  value: z.string(),
  isCorrectAnswer: z.boolean(),
});

const radioQuestionSchema = z.object({
  id: z.string(), // unique id
  questionType: z.literal(questiomTypeEnum.enum.radio),
  question: z.string(),
  descripton: z.string().optional(),
  answer: z.string(),
  options: z.array(radioOptionSchema).optional(),
  isValid: z.boolean().default(true), // the question is valid to be saved (to be used durign quiz-creation)
});

const paragraphFieldSchema = z.object({
  id: z.string(),
  title: z.string(),
  questionType: z.literal(questiomTypeEnum.enum.paragraph),
  body: z.string(),
  isValid: z.literal(true),
});

export enum fileType {
  image = "image",
  audio = "audio",
  document = "document",
}
const fileFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),

  name: z.string(),
  src: z.string().optional(),
  foreign_key: z.number().optional(),

  isRemoved: z.boolean().optional(),

  isValid: z.literal(true),
  fileType: z.nativeEnum(fileType),
  questionType: z.literal(questiomTypeEnum.enum.file),
});

const questionSchema = z.discriminatedUnion("questionType", [
  inputQuestionSchema,
  radioQuestionSchema,
  paragraphFieldSchema,
  fileFieldSchema,
]);

const quizSectionSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),

  questions: z.array(questionSchema),
});

const quizSchema = z.object({
  title: z.string(),
  description: z.string(),
  sections: z.array(quizSectionSchema),
});

export enum quizModelStatus {
  draft = "draft",
  ready = "ready",
  open = "open",
  closed = "closed",
}

export enum quizScopes {
  organization = "organization",
  course = "course",
}

/**
 * This naming is kind of stupid. This is the actual model that will be saved in the database in the backend.
 */
const quizModelSchema = z.object({
  id: z.number(),
  version: z.number(), // version of the json_data json structure in case new fields will be added in the future and to ensure backward compactibility
  json_data: quizSchema,
  status: z.nativeEnum(quizModelStatus),
  code: z.string(),

  is_survey: z.boolean(),
  is_question_order_randomized: z.boolean(),
  can_show_answers_afterwards: z.boolean(),
  max_retakes: z.number().positive(),
  scope: z.nativeEnum(quizScopes),
  activation_date: z.date().optional(),
  expiry_date: z.date().optional(),
  results_release_date: z.coerce.date().optional(),

  course: z.number().or(z.string()).optional(),
  category: z.number(),
});

export type quizModelType = typeof quizModelSchema._type;

export type questionTypes = (typeof questionTypes)[number];
export type quizType = typeof quizSchema._type;
export type quizSectionType = typeof quizSectionSchema._type;
export type questionType = typeof questionSchema._type;
export type inputQuestionType = typeof inputQuestionSchema._type;
export type radioQuestionType = typeof radioQuestionSchema._type;
export type radioOptionType = typeof radioOptionSchema._type;
