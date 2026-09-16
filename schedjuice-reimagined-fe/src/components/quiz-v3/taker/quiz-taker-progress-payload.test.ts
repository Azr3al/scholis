import { describe, expect, it } from "vitest";
import { QuestionType, type QuestionTypeV3 } from "@/types/quiz-v3";
import { buildAnswersPayload } from "./quiz-taker-progress-payload";

const mcq = (id: number): QuestionTypeV3 =>
  ({
    id,
    question_type: QuestionType.MultipleChoice,
    options: [],
  }) as unknown as QuestionTypeV3;

describe("buildAnswersPayload", () => {
  it("serializes MCQ selected ids as number array", () => {
    const q = mcq(12);
    const out = buildAnswersPayload([q], { 12: [3, 5] });
    expect(out["12"]).toEqual([3, 5]);
  });

  it("defaults missing MCQ to empty array", () => {
    const q = mcq(12);
    const out = buildAnswersPayload([q], {});
    expect(out["12"]).toEqual([]);
  });

  it("includes true/false when boolean is present", () => {
    const q = {
      id: 99,
      question_type: QuestionType.TrueFalse,
    } as unknown as QuestionTypeV3;
    const outTrue = buildAnswersPayload([q], { 99: { value: true } });
    expect(outTrue["99"]).toEqual({ value: true });
    const outAbsent = buildAnswersPayload([q], {});
    expect(Object.prototype.hasOwnProperty.call(outAbsent, "99")).toBe(false);
  });

  it("serializes short answer text or empty string default", () => {
    const q = {
      id: 77,
      question_type: QuestionType.ShortAnswer,
    } as unknown as QuestionTypeV3;
    expect(buildAnswersPayload([q], { 77: { text: "hi" } })["77"]).toEqual({
      text: "hi",
    });
    expect(buildAnswersPayload([q], {})["77"]).toEqual({ text: "" });
  });
});
