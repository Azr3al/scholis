"use client";

import { CourseCreationMethod, programType, SubjectStrategy } from "@/types/program";
import Link from "next/link";

function formatCreationMethod(method: CourseCreationMethod) {
  return method === CourseCreationMethod.intake_based
    ? "Intake-based scheduling"
    : "Manual — one course at a time";
}

function formatSubjectStrategy(strategy: SubjectStrategy) {
  switch (strategy) {
    case SubjectStrategy.required:
      return "One course per subject";
    case SubjectStrategy.multi:
      return "Class-based (multi-subject)";
    case SubjectStrategy.none:
      return "No subjects";
    default:
      return "Optional subjects";
  }
}

export function ProgramPicker({ programs }: { programs: programType[] }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Add classes</h1>
        <p className="text-sm text-text-muted">
          Choose a program to continue. Each program has its own scheduling style.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {programs.map((program) => (
          <Link
            key={program.id}
            href={`/courses/create/program/${program.id}`}
            className="block"
          >
            <div className="h-full rounded-lg border border-border bg-surface transition hover:border-primary/40">
              <div className="p-6 pb-2">
                <h3 className="text-lg font-medium">{program.name}</h3>
              </div>
              <div className="space-y-1 p-6 pt-0 text-sm text-text-muted">
                <p>{formatCreationMethod(program.course_creation_method)}</p>
                <p>{formatSubjectStrategy(program.subject_strategy)}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
