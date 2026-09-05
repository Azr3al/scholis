export enum IdCardTemplateAudience {
  student = "student",
  staff = "staff",
}

export enum IdCardTemplateSide {
  front = "front",
  back = "back",
}

export enum IdCardTextSlotField {
  name = "name",
  class = "class",
  course_title = "course_title",
  registration = "registration",
  academic_year = "academic_year",
  expires = "expires",
}

export enum IdCardSlotType {
  photo = "photo",
  text = "text",
  staticText = "static_text",
  qr = "qr",
}

export type IdCardTextAlign = "left" | "center" | "right";

export type IdCardFontStyle = "bold" | "normal";

export type IdCardTemplateSlotBase = {
  id: string;
  type: IdCardSlotType;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type IdCardPhotoSlot = IdCardTemplateSlotBase & {
  type: IdCardSlotType.photo;
  /** Corner radius in typographic points (pt); 0 = square corners. */
  borderRadiusPt?: number;
};

export type IdCardTextSlot = IdCardTemplateSlotBase & {
  type: IdCardSlotType.text;
  field: IdCardTextSlotField;
  fontSizePt?: number;
  /** Defaults to Adobe Caslon Pro when omitted or legacy "serif". */
  fontFamily?: string;
  color?: string;
  align?: IdCardTextAlign;
  fontStyle?: IdCardFontStyle;
};

/** Fixed copy set on the template (same on every card). */
export type IdCardStaticTextSlot = IdCardTemplateSlotBase & {
  type: IdCardSlotType.staticText;
  text: string;
  fontSizePt?: number;
  fontFamily?: string;
  color?: string;
  align?: IdCardTextAlign;
  fontStyle?: IdCardFontStyle;
};

export type IdCardQrSlot = IdCardTemplateSlotBase & {
  type: IdCardSlotType.qr;
};

export type IdCardTemplateSlot =
  | IdCardPhotoSlot
  | IdCardTextSlot
  | IdCardStaticTextSlot
  | IdCardQrSlot;

export type IdCardEditableTextSlot = IdCardTextSlot | IdCardStaticTextSlot;

export type IdCardTemplateSummary = {
  id: number;
  name: string;
  audience: IdCardTemplateAudience;
  width_in: number;
  height_in: number;
  background_url: string | null;
  slots: IdCardTemplateSlot[];
  back_background_url?: string | null;
  back_slots?: IdCardTemplateSlot[];
  background_transform?: {
    front?: { offsetX: number; offsetY: number; scale: number };
    back?: { offsetX: number; offsetY: number; scale: number };
  };
  academic_year: string | null;
  expires_on: string | null;
};

export type IdCardTemplate = IdCardTemplateSummary & {
  organization: number;
  background?: string | null;
  back_background?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export function templateHasBack(template: Pick<
  IdCardTemplateSummary,
  "back_background_url" | "back_slots"
>): boolean {
  return Boolean(template.back_background_url) || (template.back_slots?.length ?? 0) > 0;
}

/** Normalize tenant/API template payloads into a typed summary. */
export function toIdCardTemplateSummary(
  template: unknown,
): IdCardTemplateSummary | null {
  if (!template || typeof template !== "object") return null;
  const raw = template as Partial<IdCardTemplateSummary> & { id?: number };
  if (raw.id == null) return null;
  return {
    id: raw.id,
    name: raw.name ?? "",
    audience:
      (raw.audience as IdCardTemplateAudience) ?? IdCardTemplateAudience.student,
    width_in: Number(raw.width_in),
    height_in: Number(raw.height_in),
    background_url: raw.background_url ?? null,
    slots: (raw.slots ?? []) as IdCardTemplateSlot[],
    back_background_url: raw.back_background_url ?? null,
    back_slots: (raw.back_slots ?? []) as IdCardTemplateSlot[],
    background_transform: raw.background_transform,
    academic_year: raw.academic_year ?? null,
    expires_on: raw.expires_on ?? null,
  };
}

export const ID_CARD_TEMPLATE_DPI = 300;

/** CR80 portrait defaults (inches). */
export const DEFAULT_ID_CARD_WIDTH_IN = 2.125;
export const DEFAULT_ID_CARD_HEIGHT_IN = 3.375;

export const ID_CARD_TEXT_FIELD_LABELS: Record<IdCardTextSlotField, string> = {
  [IdCardTextSlotField.name]: "Name",
  [IdCardTextSlotField.class]: "Class",
  [IdCardTextSlotField.course_title]: "Course title",
  [IdCardTextSlotField.registration]: "Registration No.",
  [IdCardTextSlotField.academic_year]: "Academic year",
  [IdCardTextSlotField.expires]: "Expires",
};

/** Allowed text slot font sizes (typographic points). */
export const ID_CARD_FONT_SIZE_PT_OPTIONS = [
  8, 9, 10, 11, 12, 14, 16, 18, 21, 24, 28, 32, 36, 42, 48, 54, 60, 72,
] as const;

export const DEFAULT_ID_CARD_FONT_SIZE_PT = 14;

export function clampIdCardFontSizePt(value: number): number {
  return Math.min(72, Math.max(6, Math.round(value)));
}

export const ID_CARD_SLOT_PALETTE: Array<{
  type: IdCardSlotType;
  field?: IdCardTextSlotField;
  label: string;
}> = [
  { type: IdCardSlotType.photo, label: "Photo" },
  { type: IdCardSlotType.text, field: IdCardTextSlotField.name, label: "Name" },
  { type: IdCardSlotType.text, field: IdCardTextSlotField.class, label: "Class" },
  { type: IdCardSlotType.text, field: IdCardTextSlotField.course_title, label: "Course title" },
  {
    type: IdCardSlotType.text,
    field: IdCardTextSlotField.registration,
    label: "Registration No.",
  },
  {
    type: IdCardSlotType.text,
    field: IdCardTextSlotField.academic_year,
    label: "Academic year",
  },
  { type: IdCardSlotType.text, field: IdCardTextSlotField.expires, label: "Expires" },
  { type: IdCardSlotType.staticText, label: "Custom text" },
  { type: IdCardSlotType.qr, label: "QR code" },
];
