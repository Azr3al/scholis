import { defaultQuestion } from "@/store/quiz-v3";
import { QuestionType } from "@/types/quiz-v3";
import { describe, expect, it } from "vitest";
import {
  areEditorSyncQuestionsValid,
  validateEditorSyncQuestions,
} from "./quiz-editor-questions-sync-valid";
import { buildEditorSyncQuestionPayload } from "./quiz-editor-sync-payload";

const QUIZ_ID = 1;

function payload(
  q: import("@/types/quiz-v3").QuestionTypeV3,
  displayOrder = 0,
): Record<string, unknown> {
  return buildEditorSyncQuestionPayload(QUIZ_ID, q, displayOrder);
}

describe("areEditorSyncQuestionsValid", () => {
  it("rejects multiple-choice with empty option bodies", () => {
    const q = defaultQuestion(QuestionType.MultipleChoice);
    expect(areEditorSyncQuestionsValid([payload(q)])).toBe(false);
  });

  it("accepts multiple-choice with two non-empty options and one correct", () => {
    const q = defaultQuestion(QuestionType.MultipleChoice);
    q.options[0]!.body = "Alpha";
    q.options[1]!.body = "Beta";
    q.options[0]!.is_correct = true;
    q.options[1]!.is_correct = false;
    expect(areEditorSyncQuestionsValid([payload(q)])).toBe(true);
  });

  it("rejects single-choice when no option is correct", () => {
    const q = defaultQuestion(QuestionType.SingleChoice);
    q.options[0]!.body = "A";
    q.options[1]!.body = "B";
    q.options[0]!.is_correct = false;
    q.options[1]!.is_correct = false;
    expect(areEditorSyncQuestionsValid([payload(q)])).toBe(false);
  });

  it("rejects fill-in-blank when slot uuid set does not match prompt blanks", () => {
    const q = defaultQuestion(QuestionType.FillInBlank);
    q.fill_blank_slots![0]!.acceptable_answers = [{ body: "ok", display_order: 0 }];
    q.fill_blank_slots![0]!.blank_uuid = "00000000-0000-4000-8000-000000000099";
    expect(areEditorSyncQuestionsValid([payload(q)])).toBe(false);
  });

  it("accepts fill-in-blank with matching uuid and non-empty acceptable answers", () => {
    const q = defaultQuestion(QuestionType.FillInBlank);
    q.fill_blank_slots![0]!.acceptable_answers = [{ body: "Paris", display_order: 0 }];
    expect(areEditorSyncQuestionsValid([payload(q)])).toBe(true);
  });

  it("rejects fill-in-blank when sum of blank points does not match question points", () => {
    const q = defaultQuestion(QuestionType.FillInBlank);
    q.points = 2;
    q.fill_blank_slots![0]!.points = 1;
    q.fill_blank_slots![0]!.acceptable_answers = [{ body: "x", display_order: 0 }];
    expect(areEditorSyncQuestionsValid([payload(q)])).toBe(false);
  });

  it("validateEditorSyncQuestions returns structured issue for empty MC option", () => {
    const q = defaultQuestion(QuestionType.MultipleChoice);
    const issues = validateEditorSyncQuestions([payload(q)]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.questionIndex).toBe(0);
    expect(issues[0]!.details.options).toBeDefined();
  });

  it("validateEditorSyncQuestions returns structured issue for SC with no correct", () => {
    const q = defaultQuestion(QuestionType.SingleChoice);
    q.options[0]!.body = "A";
    q.options[1]!.body = "B";
    q.options[0]!.is_correct = false;
    q.options[1]!.is_correct = false;
    const issues = validateEditorSyncQuestions([payload(q)]);
    expect(issues[0]!.details.non_field_errors).toBeDefined();
  });

  it("validateEditorSyncQuestions returns issue for FIB uuid mismatch", () => {
    const q = defaultQuestion(QuestionType.FillInBlank);
    q.fill_blank_slots![0]!.acceptable_answers = [{ body: "ok", display_order: 0 }];
    q.fill_blank_slots![0]!.blank_uuid = "00000000-0000-4000-8000-000000000099";
    const issues = validateEditorSyncQuestions([payload(q)]);
    expect(issues[0]!.details.non_field_errors).toBeDefined();
  });

  it("validateEditorSyncQuestions returns issue for FIB points sum mismatch", () => {
    const q = defaultQuestion(QuestionType.FillInBlank);
    q.points = 2;
    q.fill_blank_slots![0]!.points = 1;
    q.fill_blank_slots![0]!.acceptable_answers = [{ body: "x", display_order: 0 }];
    const issues = validateEditorSyncQuestions([payload(q)]);
    expect(issues[0]!.details.points).toBeDefined();
  });

  it("rejects short answer with empty acceptable row", () => {
    const p: Record<string, unknown> = {
      quiz: QUIZ_ID,
      question_type: "SHORT_ANSWER",
      body: { type: "doc", content: [] },
      body_plaintext: "",
      points: 1,
      display_order: 0,
      is_case_sensitive: false,
      options: [],
      short_answer_acceptables: [{ body: "", display_order: 0 }],
    };
    expect(areEditorSyncQuestionsValid([p])).toBe(false);
    const issues = validateEditorSyncQuestions([p]);
    expect(issues[0]!.details.short_answer_acceptables).toBeDefined();
  });
});
