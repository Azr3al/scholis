"use client";

import {
  FieldLabelSuffix,
} from "@/components/form/required-mark";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { EXAM_SESSION_YEARS_AHEAD } from "@/components/form/selectors/year-selector";
import { Field, Select } from "@/components/primitives";
import { EXAM_BOARD_OPTIONS, type ExamBoardType } from "@/types/course";

export type IntakeExamDefaults = {
  examSessionDate: string | null;
  examBoard: ExamBoardType | null;
};

export function IntakeExamDefaultsFields({
  value,
  onChange,
  required = false,
}: {
  value: IntakeExamDefaults;
  onChange: (next: IntakeExamDefaults) => void;
  required?: boolean;
}) {
  return (
    <div className="space-y-4">
      <Field.Root>
        <Field.Label>
          Exam session
          <FieldLabelSuffix required={required} />
        </Field.Label>
        <Field.Description>Exam session month and year.</Field.Description>
        <YearMonthSelector
          date={
            value.examSessionDate
              ? new Date(value.examSessionDate)
              : undefined
          }
          yearsAhead={EXAM_SESSION_YEARS_AHEAD}
          fullWidth
          setDate={(d) =>
            onChange({
              ...value,
              examSessionDate: d
                ? new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
                : null,
            })
          }
          label=""
        />
      </Field.Root>
      <Field.Root>
        <Field.Label>
          Exam board
          <FieldLabelSuffix required={required} />
        </Field.Label>
        <Select
          items={EXAM_BOARD_OPTIONS.map((opt) => ({
            label: opt,
            value: opt,
          }))}
          value={value.examBoard ?? ""}
          onValueChange={(v) =>
            onChange({
              ...value,
              examBoard: (v as ExamBoardType) || null,
            })
          }
          placeholder="Select exam board"
          className="w-full"
        />
      </Field.Root>
    </div>
  );
}

export function intakeExamDefaultsComplete(
  value: IntakeExamDefaults,
): boolean {
  return Boolean(value.examSessionDate && value.examBoard);
}
