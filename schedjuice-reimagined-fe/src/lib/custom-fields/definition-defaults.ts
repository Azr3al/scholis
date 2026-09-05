import type { FieldFilledBy, FieldRequiredAt } from "@/types/custom-fields";
import type { AttachmentFieldRules } from "@/lib/custom-fields/attachment-rules";
import { DEFAULT_ATTACHMENT_FIELD_RULES } from "@/lib/custom-fields/attachment-rules";

export type ChoiceRow = { value: string; label: string };

type VisibilityFlags = {
  show_on_create: boolean;
  show_on_edit: boolean;
  show_on_detail: boolean;
};

const CHOICE_TYPES = new Set(["choice", "multichoice"]);

/** Normalize a label into a slug key (lowercase, spaces->_, [a-z0-9_-] only). */
export function slugifyKey(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "");
}

/** Default visibility implied by the requiredness stage. */
function deriveVisibility(requiredAt: FieldRequiredAt): VisibilityFlags {
  return {
    show_on_create: requiredAt === "registration",
    show_on_edit: true,
    show_on_detail: true,
  };
}

type DefinitionDraft = {
  entity_type: string;
  field_key: string;
  field_label: string;
  field_type: string;
  required_at: FieldRequiredAt;
  roles: string[];
  filled_by: FieldFilledBy;
  is_filterable: boolean;
  description: string;
  group: number | null;
  choices?: ChoiceRow[];
  attachmentRules?: AttachmentFieldRules;
  visibilityOverride?: VisibilityFlags;
};

/** Build the JSON body sent to the definitions create/update endpoint. */
export function buildDefinitionPayload(
  draft: DefinitionDraft
): Record<string, unknown> {
  const visibility = draft.visibilityOverride
    ? { ...draft.visibilityOverride }
    : deriveVisibility(draft.required_at);
  // Cross-field rule: registration must show on create regardless of override.
  if (draft.required_at === "registration") visibility.show_on_create = true;

  const body: Record<string, unknown> = {
    entity_type: draft.entity_type,
    field_key: draft.field_key,
    field_label: draft.field_label,
    field_type: draft.field_type,
    required_at: draft.required_at,
    roles: draft.roles,
    filled_by: draft.filled_by,
    is_filterable: draft.is_filterable,
    description: draft.description ?? "",
    group: draft.group,
    is_active: true,
    ...visibility,
  };
  if (CHOICE_TYPES.has(draft.field_type) && draft.choices?.length) {
    body.choices = draft.choices;
  }
  if (draft.field_type === "attachment" && draft.attachmentRules) {
    body.validation_rules = draft.attachmentRules;
  }
  return body;
}
