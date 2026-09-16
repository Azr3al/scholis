import { SubjectStrategy } from "@/types/program";

export type IntakeStepId =
  | "structure"
  | "subjects"
  | "dates"
  | "preview"
  | "confirm";

export type IntakeFlowContext = {
  isFirstIntake: boolean;
  hasProgramStructure: boolean;
  hasProgramSubjects: boolean;
  subjectStrategy: SubjectStrategy;
};

export function needsStructureStep(ctx: IntakeFlowContext): boolean {
  return (
    ctx.subjectStrategy === SubjectStrategy.multi &&
    ctx.isFirstIntake &&
    !ctx.hasProgramStructure
  );
}

export function needsProgramSubjectsStep(ctx: IntakeFlowContext): boolean {
  return (
    ctx.subjectStrategy === SubjectStrategy.required &&
    ctx.isFirstIntake &&
    !ctx.hasProgramSubjects
  );
}

export function needsLevelSubjectsStep(ctx: IntakeFlowContext): boolean {
  return ctx.subjectStrategy === SubjectStrategy.multi;
}

function getMultiIntakeSteps(ctx: IntakeFlowContext): IntakeStepId[] {
  if (ctx.isFirstIntake) {
    if (ctx.hasProgramStructure) {
      return ["subjects", "dates", "preview", "confirm"];
    }
    return ["structure", "subjects", "dates", "preview", "confirm"];
  }
  return ["dates", "subjects", "preview", "confirm"];
}

function getRequiredIntakeSteps(ctx: IntakeFlowContext): IntakeStepId[] {
  const steps: IntakeStepId[] = ["dates"];
  if (needsProgramSubjectsStep(ctx)) {
    steps.push("subjects");
  }
  steps.push("preview", "confirm");
  return steps;
}

export function getIntakeSteps(ctx: IntakeFlowContext): IntakeStepId[] {
  if (ctx.subjectStrategy === SubjectStrategy.required) {
    return getRequiredIntakeSteps(ctx);
  }
  return getMultiIntakeSteps(ctx);
}

export function getNextIntakeStep(
  current: IntakeStepId,
  ctx: IntakeFlowContext,
): IntakeStepId | null {
  const steps = getIntakeSteps(ctx);
  const idx = steps.indexOf(current);
  if (idx < 0 || idx >= steps.length - 1) return null;
  return steps[idx + 1];
}

export function getPrevIntakeStep(
  current: IntakeStepId,
  ctx: IntakeFlowContext,
): IntakeStepId | null {
  const steps = getIntakeSteps(ctx);
  const idx = steps.indexOf(current);
  if (idx <= 0) return null;
  return steps[idx - 1];
}

export function intakeStepPath(programId: string, step: IntakeStepId) {
  return `/courses/create/program/${programId}/intake/${step}`;
}

export function getFirstIntakeStep(ctx: IntakeFlowContext): IntakeStepId {
  return getIntakeSteps(ctx)[0];
}

export function getRedirectStepForInvalidRoute(
  step: IntakeStepId,
  ctx: IntakeFlowContext,
): IntakeStepId | null {
  if (step === "structure" && !needsStructureStep(ctx)) {
    return getFirstIntakeStep(ctx);
  }

  if (step === "subjects") {
    if (ctx.subjectStrategy === SubjectStrategy.required) {
      if (!needsProgramSubjectsStep(ctx)) {
        return getNextIntakeStep("dates", ctx) ?? "preview";
      }
      return null;
    }
    if (needsStructureStep(ctx)) {
      return "structure";
    }
  }

  if (step === "dates" && needsStructureStep(ctx)) {
    return "structure";
  }

  const steps = getIntakeSteps(ctx);
  if (!steps.includes(step)) {
    return getFirstIntakeStep(ctx);
  }

  return null;
}
