import { describe, expect, it } from "vitest";
import { SAMPLE_AWARD_BINDER } from "./preview-binder";
import {
  applyBraceSuggestion,
  braceSuggestQuery,
  interpolateVariableTemplate,
  moveTemplatePiece,
  splitTemplatePieces,
  tokensFromBinder,
  variableTemplate,
} from "./variable-template";
import type { Layer } from "./types";

const base = {
  id: "1",
  x: 0,
  y: 0,
  width: 80,
  height: 24,
  z: 0,
} as const;

describe("variableTemplate", () => {
  it("defaults a named person layer to {{named_person}}", () => {
    const layer: Layer = { ...base, type: "named_person", user_id: 7 };
    expect(variableTemplate(layer)).toBe("{{named_person}}");
  });

  it("keeps an edited sentence on the layer", () => {
    const layer: Layer = {
      ...base,
      type: "named_person",
      user_id: 7,
      template: "This award is for {{named person}}",
    };
    expect(variableTemplate(layer)).toBe("This award is for {{named person}}");
  });
});

describe("interpolateVariableTemplate", () => {
  it("fills named person inside a sentence, including spaced tokens", () => {
    const tokens = tokensFromBinder(SAMPLE_AWARD_BINDER, "Kyaw Thu");
    expect(
      interpolateVariableTemplate("This award is for {{named person}}", tokens),
    ).toBe("This award is for Kyaw Thu");
    expect(
      interpolateVariableTemplate("Signed, {{mt_name}} — {{course_name}}", tokens),
    ).toBe("Signed, Main Teacher — Sample course");
  });

  it("leaves unknown tokens in place", () => {
    expect(
      interpolateVariableTemplate("Hello {{missing}}", tokensFromBinder(SAMPLE_AWARD_BINDER)),
    ).toBe("Hello {{missing}}");
  });
});

describe("template pieces", () => {
  it("keeps spaces inside a text run instead of splitting words", () => {
    expect(splitTemplatePieces("this is to certify that {{student_name}}")).toEqual([
      { kind: "text", text: "this is to certify that " },
      { kind: "token", key: "student_name", raw: "{{student_name}}" },
    ]);
  });

  it("keeps tokens atomic so a sentence can hold more than one", () => {
    const pieces = splitTemplatePieces(
      "this is to certify that {{student_name}} finished {{course_name}}",
    );
    expect(pieces.filter((piece) => piece.kind === "token").map((piece) => piece.key)).toEqual([
      "student_name",
      "course_name",
    ]);
  });

  it("moves a token between words", () => {
    const source = "award for {{student_name}} today";
    const pieces = splitTemplatePieces(source);
    const tokenAt = pieces.findIndex((piece) => piece.kind === "token");
    expect(moveTemplatePiece(source, tokenAt, 0)).toBe("{{student_name}}award for  today");
    expect(moveTemplatePiece(source, tokenAt, pieces.length)).toBe("award for  today{{student_name}}");
  });

  it("suggests a variable after typing {", () => {
    expect(braceSuggestQuery("Hello {stu", 10)).toEqual({ start: 6, query: "stu" });
    expect(applyBraceSuggestion("Hello {stu", 10, "student_name")).toEqual({
      text: "Hello {{student_name}}",
      caret: 22,
    });
  });
});
