import * as z from "zod";
import type { ReportFieldType } from "@/types/user-log";
import { REPORT_TYPE_FIELD_LABELS } from "./report-type-field-labels";

export type DraftReportTypeField = {
  field_key: string;
  field_label: string;
  field_type: ReportFieldType;
  is_required: boolean;
  choices: { value: string; label: string }[] | null;
  sort_order: number;
};

export function reportTypeFieldLabel(type: ReportFieldType): string {
  return REPORT_TYPE_FIELD_LABELS[type];
}

const choiceRowSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

export const reportTypeFieldEditorSchema = z
  .object({
    field_label: z.string().min(1, "Give the field a label."),
    field_key: z
      .string()
      .min(1)
      .regex(
        /^[a-z0-9_-]+$/,
        "Lowercase letters, numbers, hyphens or underscores.",
      ),
    field_type: z.string(),
    is_required: z.boolean(),
    choices: z.array(choiceRowSchema).default([]),
  })
  .superRefine((d, ctx) => {
    if (
      (d.field_type === "choice" || d.field_type === "multichoice") &&
      d.choices.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["choices"],
        message: "Add at least one choice.",
      });
    }
  });

type ValidateDraftResult =
  | { ok: true }
  | { ok: false; message: string; fieldKey: string };

export function validateDraftField(
  field: DraftReportTypeField,
): ValidateDraftResult {
  if (!field.field_label.trim()) {
    return {
      ok: false,
      message: "Give the field a label.",
      fieldKey: field.field_key,
    };
  }
  if (!/^[a-z0-9_-]+$/.test(field.field_key)) {
    return {
      ok: false,
      message:
        "Field key must use lowercase letters, numbers, hyphens or underscores.",
      fieldKey: field.field_key,
    };
  }
  if (
    (field.field_type === "choice" || field.field_type === "multichoice") &&
    (!field.choices || field.choices.length === 0)
  ) {
    return {
      ok: false,
      message: "Add at least one choice.",
      fieldKey: field.field_key,
    };
  }
  return { ok: true };
}

export function findFirstInvalidDraftField(
  fields: DraftReportTypeField[],
): ValidateDraftResult & { index?: number } {
  for (let i = 0; i < fields.length; i++) {
    const result = validateDraftField(fields[i]!);
    if (!result.ok) return { ...result, index: i };
  }
  return { ok: true };
}
