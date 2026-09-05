import type { SubjectChipSource } from "@/helpers/course-identity";

export type CourseIdentityVariant = "hub" | "record" | "rail";

export type CourseIdentityCourse = Omit<SubjectChipSource, "program"> & {
  title?: string | null;
  code?: string | null;
  status?: string | null;
  weekday_pattern?: string | null;
  time_pattern?: string | null;
  first_event_time_from?: string | null;
  first_event_time_to?: string | null;
  program?: number | { name?: string; subject_strategy?: string } | null;
  level?: number | { name?: string } | null;
  section?: number | { name?: string } | null;
};

export type RecordIdentityExtras = {
  assignedRoleName?: string | null;
  roleSeniority?: string | null;
  isShared?: boolean;
  nextSessionLabel?: string | null;
};
