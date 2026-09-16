import type { PaletteItem, TemplateKind } from "./types";

const AWARD_PALETTE: PaletteItem[] = [
  { key: "text", label: "Text" },
  { key: "photo", label: "Student award photo" },
  { key: "student_name", label: "Student name" },
  { key: "award_title", label: "Award title" },
  { key: "period", label: "Period" },
  { key: "course_name", label: "Course name" },
  { key: "pronoun", label: "Pronoun" },
  { key: "current_date", label: "Current date" },
  { key: "mt_name", label: "MT name" },
  { key: "mt_signature", label: "MT signature" },
  { key: "named_person", label: "Named person" },
  { key: "user_signature", label: "User signature" },
];

const ID_CARD_PALETTE: PaletteItem[] = [
  { key: "photo", label: "Photo" },
  { key: "name", label: "Name" },
  { key: "class", label: "Class" },
  { key: "course_title", label: "Course title" },
  { key: "registration", label: "Registration No." },
  { key: "academic_year", label: "Academic year" },
  { key: "expires", label: "Expires" },
  { key: "text", label: "Custom text" },
  { key: "qr", label: "QR code" },
];

export function paletteForKind(kind: TemplateKind): PaletteItem[] {
  if (kind === "award") return AWARD_PALETTE;
  return ID_CARD_PALETTE;
}
