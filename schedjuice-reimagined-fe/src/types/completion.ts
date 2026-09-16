import type { FieldFilledBy, FieldSource } from "@/types/form-config";

export type MissingField = {
  field_key: string;
  field_label: string;
  filled_by: FieldFilledBy;
  source: FieldSource;
};

export type ProfileCompleteness = {
  percent: number;
  missing: MissingField[];
};

export type CompletionAudience = "user" | "admin";

export const EMPTY_COMPLETENESS: ProfileCompleteness = {
  percent: 100,
  missing: [],
};
