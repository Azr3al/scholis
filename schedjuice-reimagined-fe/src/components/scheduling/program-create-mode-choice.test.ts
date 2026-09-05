import { describe, expect, it } from "vitest";
import { shouldShowProgramCreateModeChoice } from "./program-create-mode-choice-logic";
import {
  CourseCreationMethod,
  SubjectStrategy,
  programType,
} from "@/types/program";

describe("shouldShowProgramCreateModeChoice", () => {
  it("shows the mode choice for exam-prep intake-based programs", () => {
    expect(
      shouldShowProgramCreateModeChoice({
        course_creation_method: CourseCreationMethod.intake_based,
        subject_strategy: SubjectStrategy.required,
      } as programType),
    ).toBe(true);
  });

  it("shows the mode choice for K-12 multi intake-based programs", () => {
    expect(
      shouldShowProgramCreateModeChoice({
        course_creation_method: CourseCreationMethod.intake_based,
        subject_strategy: SubjectStrategy.multi,
      } as programType),
    ).toBe(true);
  });

  it("does not show the mode choice for manual programs", () => {
    expect(
      shouldShowProgramCreateModeChoice({
        course_creation_method: CourseCreationMethod.manual,
        subject_strategy: SubjectStrategy.optional,
      } as programType),
    ).toBe(false);
  });
});
