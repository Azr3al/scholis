import { describe, expect, it } from "vitest";
import {
  emptyQuizV3TiptapDoc,
  feedbackDocToPlainText,
  plainTextToFeedbackDoc,
} from "@/helpers/quiz-essay-feedback-doc";

describe("quiz-essay-feedback-doc", () => {
  it("round-trips plain text through a minimal TipTap doc", () => {
    const doc = plainTextToFeedbackDoc("  Hello  ");
    expect(feedbackDocToPlainText(doc)).toBe("Hello");
  });

  it("empty input yields empty doc", () => {
    const doc = plainTextToFeedbackDoc("");
    expect(doc).toEqual(emptyQuizV3TiptapDoc());
    expect(feedbackDocToPlainText(doc)).toBe("");
  });
});
