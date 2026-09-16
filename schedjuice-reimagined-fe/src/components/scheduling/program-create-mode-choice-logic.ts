import {
  CourseCreationMethod,
  SubjectStrategy,
  type programType,
} from "@/types/program";

export function shouldShowProgramCreateModeChoice(program: programType): boolean {
  return (
    program.course_creation_method === CourseCreationMethod.intake_based &&
    (program.subject_strategy === SubjectStrategy.required ||
      program.subject_strategy === SubjectStrategy.multi)
  );
}
