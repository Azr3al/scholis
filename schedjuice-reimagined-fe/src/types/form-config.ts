export type FieldSource = "builtin" | "custom";
export type FieldRequiredAt = "registration" | "profile_completion" | "never";
export type FieldFilledBy = "user" | "admin" | "both";
export type FormSurface = "create" | "edit" | "detail";

export type FormConfigChoice = { value: string; label: string };

export type FormConfigField = {
  id: number;
  source: FieldSource;
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  choices: FormConfigChoice[] | null;
  description: string;
  requiredAt: FieldRequiredAt;
  filledBy: FieldFilledBy;
  isFilterable: boolean;
  sortOrder: number;
  validationRules: Record<string, unknown> | null;
  groupId: number | null;
};

export type FormConfigGroup = {
  id: number | null;
  name: string;
  sortOrder: number;
  fields: FormConfigField[];
};

export type FormConfig = {
  entityType: string;
  surface: FormSurface;
  groups: FormConfigGroup[];
};

export const EMPTY_FORM_CONFIG: FormConfig = {
  entityType: "app_auth.User",
  surface: "edit",
  groups: [],
};
