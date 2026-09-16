export type AwardFamily = "academic_excellence" | "attendance";

export type AwardOrigin = "admin" | "promoted" | "local";

export type AwardTitle = {
  id: number;
  name: string;
  family: AwardFamily | null;
  course: number | null;
  is_pinned: boolean;
  origin: AwardOrigin;
  retired_at: string | null;
  sort_order: number;
  created_by: number | null;
  created_at: string;
};

export type AwardTemplate = {
  id: number;
  title: number;
  name: string;
  document: unknown;
  background_url: string | null;
  created_by: number | null;
  created_at: string;
};

export type AwardTitleSummary = {
  id: number;
  name: string;
  family: AwardFamily | null;
  origin: AwardOrigin;
  is_pinned: boolean;
  has_display_template?: boolean;
};

export type AwardDisplayTemplate = {
  id: number;
  name: string;
  document: unknown;
  background_url: string | null;
};

export type AwardGrantChip = {
  id: number;
  title: AwardTitleSummary & { display_template: AwardDisplayTemplate | null };
};

export type AwardBoardStudent = {
  id: number;
  name: string;
  grants: AwardGrantChip[];
};

export type AwardPickerGroups = {
  pinned: AwardTitleSummary[];
  top10: AwardTitleSummary[];
  local: AwardTitleSummary[];
  other: AwardTitleSummary[];
};

export type CourseAwardsBoard = {
  students: AwardBoardStudent[];
  picker: AwardPickerGroups;
};

export const AWARD_FAMILY_LABELS: Record<AwardFamily, string> = {
  academic_excellence: "Academic excellence",
  attendance: "Attendance",
};

export function formatAwardFamily(family: AwardFamily | null | undefined): string {
  if (!family) return "None";
  return AWARD_FAMILY_LABELS[family] ?? family;
}
