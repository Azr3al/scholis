import {
  formatExpiresOn,
} from "@/lib/id-card/template-geometry";
import type { CardViewModel } from "@/lib/id-card/types";
import {
  IdCardSlotType,
  IdCardTextSlotField,
  type IdCardEditableTextSlot,
  type IdCardStaticTextSlot,
  type IdCardTemplateSlot,
  type IdCardTemplateSummary,
  type IdCardTextSlot,
} from "@/types/id-card-template";

export function isEditableTextSlot(
  slot: IdCardTemplateSlot,
): slot is IdCardEditableTextSlot {
  return (
    slot.type === IdCardSlotType.text || slot.type === IdCardSlotType.staticText
  );
}

export function resolveTextSlotValue(
  slot: IdCardTextSlot,
  vm: CardViewModel,
  template: IdCardTemplateSummary,
): string {
  switch (slot.field) {
    case IdCardTextSlotField.name:
      return vm.name;
    case IdCardTextSlotField.class:
      return vm.className ?? "";
    case IdCardTextSlotField.course_title:
      return vm.courseTitle ?? "";
    case IdCardTextSlotField.registration:
      return vm.studentId ?? "";
    case IdCardTextSlotField.academic_year:
      return template.academic_year ?? "";
    case IdCardTextSlotField.expires:
      return formatExpiresOn(vm.expiresOn ?? template.expires_on) ?? "";
    default:
      return "";
  }
}

export function resolveStaticTextSlotValue(slot: IdCardStaticTextSlot): string {
  return slot.text?.trim() ?? "";
}

export function slotDisplayText(
  slot: IdCardEditableTextSlot,
): string {
  if (slot.type === IdCardSlotType.staticText) {
    return resolveStaticTextSlotValue(slot) || "Your text";
  }
  return textSlotSamplePreview(slot.field);
}

export function slotPreviewLabel(
  slot: IdCardTemplateSlot,
): string {
  if (slot.type === IdCardSlotType.photo) return "Photo";
  if (slot.type === IdCardSlotType.qr) return "QR";
  if (slot.type === IdCardSlotType.staticText) {
    const preview = resolveStaticTextSlotValue(slot);
    if (!preview) return "Custom text";
    return preview.length > 18 ? `${preview.slice(0, 18)}…` : preview;
  }
  if (slot.type === IdCardSlotType.text) {
    if (slot.field === IdCardTextSlotField.name) return "Name";
    if (slot.field === IdCardTextSlotField.class) return "Class";
    if (slot.field === IdCardTextSlotField.course_title) return "Course";
    if (slot.field === IdCardTextSlotField.registration) return "Reg No.";
    if (slot.field === IdCardTextSlotField.academic_year) return "Year";
    if (slot.field === IdCardTextSlotField.expires) return "Expires";
  }
  return "Text";
}

export function textSlotSamplePreview(field: IdCardTextSlotField): string {
  switch (field) {
    case IdCardTextSlotField.name:
      return "Sample Name";
    case IdCardTextSlotField.class:
      return "Year 4 (Room 1)";
    case IdCardTextSlotField.course_title:
      return "Introduction to Biology";
    case IdCardTextSlotField.registration:
      return "00156";
    case IdCardTextSlotField.academic_year:
      return "2026-2027";
    case IdCardTextSlotField.expires:
      return "31.1.2026";
    default:
      return "Text";
  }
}
