/** Mirrors Django CustomFieldDefinition (active definitions for an entity type). */

export type CustomFieldFormInputMode = "editable" | "read_only";

export type FieldSource = "custom" | "builtin";
export type FieldRequiredAt = "registration" | "profile_completion" | "never";
export type FieldFilledBy = "user" | "admin" | "both";

export type FieldGroupDto = {
  id: number;
  entity_type: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type CustomFieldDefinitionDto = {
  id: number;
  source: FieldSource;
  entity_type: string;
  field_key: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  is_filterable: boolean;
  sort_order: number;
  choices: { value: string; label: string }[] | null;
  validation_rules: Record<string, unknown> | null;
  description: string;
  is_active: boolean;
  required_at: FieldRequiredAt;
  roles: string[];
  filled_by: FieldFilledBy;
  group: number | null;
  show_on_create: boolean;
  show_on_edit: boolean;
  show_on_detail: boolean;
  form_input_mode: CustomFieldFormInputMode;
};

export const CUSTOM_FIELD_ENTITY_USER = "app_auth.User";
export const CUSTOM_FIELD_ENTITY_COURSE = "app_course.Course";
