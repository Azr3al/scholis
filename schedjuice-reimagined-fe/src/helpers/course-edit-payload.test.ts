import { describe, expect, it } from "vitest";
import { stripUntouchedExamFields } from "./course-edit-payload";

describe("stripUntouchedExamFields", () => {
  it("drops nullish exam keys so partial saves do not clear them", () => {
    expect(
      stripUntouchedExamFields({
        title: "Renamed",
        exam_board: null,
        exam_session_date: undefined,
      }),
    ).toEqual({ title: "Renamed" });
  });

  it("keeps real exam values", () => {
    expect(
      stripUntouchedExamFields({
        exam_board: "CIE",
        exam_session_date: "2026-06-01T00:00:00.000Z",
      }),
    ).toEqual({
      exam_board: "CIE",
      exam_session_date: "2026-06-01T00:00:00.000Z",
    });
  });

  it("preserves explicit null on non-exam fields", () => {
    expect(
      stripUntouchedExamFields({
        subject: null,
        exam_board: "EdExcel",
      }),
    ).toEqual({
      subject: null,
      exam_board: "EdExcel",
    });
  });
});
