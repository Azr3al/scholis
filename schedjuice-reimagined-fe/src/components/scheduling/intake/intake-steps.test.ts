import { describe, expect, it } from "vitest";
import { SubjectStrategy } from "@/types/program";
import {
  getFirstIntakeStep,
  getIntakeSteps,
  getRedirectStepForInvalidRoute,
  needsProgramSubjectsStep,
  needsStructureStep,
  type IntakeFlowContext,
} from "./intake-steps";

function ctx(
  overrides: Partial<IntakeFlowContext> = {},
): IntakeFlowContext {
  return {
    isFirstIntake: true,
    hasProgramStructure: false,
    hasProgramSubjects: false,
    subjectStrategy: SubjectStrategy.multi,
    ...overrides,
  };
}

describe("getIntakeSteps", () => {
  it("required first intake empty catalog includes subjects after dates", () => {
    expect(
      getIntakeSteps(
        ctx({
          subjectStrategy: SubjectStrategy.required,
          isFirstIntake: true,
          hasProgramSubjects: false,
        }),
      ),
    ).toEqual(["dates", "subjects", "preview", "confirm"]);
  });

  it("required first intake with catalog skips subjects", () => {
    expect(
      getIntakeSteps(
        ctx({
          subjectStrategy: SubjectStrategy.required,
          isFirstIntake: true,
          hasProgramSubjects: true,
        }),
      ),
    ).toEqual(["dates", "preview", "confirm"]);
  });

  it("required subsequent intake skips subjects", () => {
    expect(
      getIntakeSteps(
        ctx({
          subjectStrategy: SubjectStrategy.required,
          isFirstIntake: false,
          hasProgramSubjects: false,
        }),
      ),
    ).toEqual(["dates", "preview", "confirm"]);
  });

  it("multi first intake without levels starts at structure", () => {
    expect(
      getIntakeSteps(
        ctx({
          subjectStrategy: SubjectStrategy.multi,
          isFirstIntake: true,
          hasProgramStructure: false,
        }),
      ),
    ).toEqual(["structure", "subjects", "dates", "preview", "confirm"]);
  });

  it("multi first intake with levels skips structure", () => {
    expect(
      getIntakeSteps(
        ctx({
          subjectStrategy: SubjectStrategy.multi,
          isFirstIntake: true,
          hasProgramStructure: true,
        }),
      ),
    ).toEqual(["subjects", "dates", "preview", "confirm"]);
  });

  it("multi subsequent intake uses dates first", () => {
    expect(
      getIntakeSteps(
        ctx({
          subjectStrategy: SubjectStrategy.multi,
          isFirstIntake: false,
        }),
      ),
    ).toEqual(["dates", "subjects", "preview", "confirm"]);
  });
});

describe("getFirstIntakeStep", () => {
  it("required strategy starts at dates", () => {
    expect(
      getFirstIntakeStep(
        ctx({ subjectStrategy: SubjectStrategy.required }),
      ),
    ).toBe("dates");
  });
});

describe("guard helpers", () => {
  it("needsStructureStep only for multi first intake without levels", () => {
    expect(
      needsStructureStep(
        ctx({
          subjectStrategy: SubjectStrategy.multi,
          isFirstIntake: true,
          hasProgramStructure: false,
        }),
      ),
    ).toBe(true);
    expect(
      needsStructureStep(
        ctx({
          subjectStrategy: SubjectStrategy.required,
          isFirstIntake: true,
          hasProgramStructure: false,
        }),
      ),
    ).toBe(false);
    expect(
      needsStructureStep(
        ctx({
          subjectStrategy: SubjectStrategy.multi,
          isFirstIntake: true,
          hasProgramStructure: true,
        }),
      ),
    ).toBe(false);
  });

  it("needsProgramSubjectsStep only for required first intake without catalog", () => {
    expect(
      needsProgramSubjectsStep(
        ctx({
          subjectStrategy: SubjectStrategy.required,
          isFirstIntake: true,
          hasProgramSubjects: false,
        }),
      ),
    ).toBe(true);
    expect(
      needsProgramSubjectsStep(
        ctx({
          subjectStrategy: SubjectStrategy.required,
          isFirstIntake: true,
          hasProgramSubjects: true,
        }),
      ),
    ).toBe(false);
    expect(
      needsProgramSubjectsStep(
        ctx({
          subjectStrategy: SubjectStrategy.required,
          isFirstIntake: false,
          hasProgramSubjects: false,
        }),
      ),
    ).toBe(false);
  });
});

describe("getRedirectStepForInvalidRoute", () => {
  it("redirects structure to dates for required strategy", () => {
    expect(
      getRedirectStepForInvalidRoute(
        "structure",
        ctx({ subjectStrategy: SubjectStrategy.required }),
      ),
    ).toBe("dates");
  });

  it("redirects subjects to preview when required catalog already exists", () => {
    expect(
      getRedirectStepForInvalidRoute(
        "subjects",
        ctx({
          subjectStrategy: SubjectStrategy.required,
          isFirstIntake: true,
          hasProgramSubjects: true,
        }),
      ),
    ).toBe("preview");
  });

  it("redirects dates to structure for multi without levels", () => {
    expect(
      getRedirectStepForInvalidRoute(
        "dates",
        ctx({
          subjectStrategy: SubjectStrategy.multi,
          isFirstIntake: true,
          hasProgramStructure: false,
        }),
      ),
    ).toBe("structure");
  });

  it("redirects subjects to structure for multi without levels", () => {
    expect(
      getRedirectStepForInvalidRoute(
        "subjects",
        ctx({
          subjectStrategy: SubjectStrategy.multi,
          isFirstIntake: true,
          hasProgramStructure: false,
        }),
      ),
    ).toBe("structure");
  });
});
