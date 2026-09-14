import {
  canAccessCourseAttendance,
  permissionsFor,
  isStudent,
} from "@/helpers/authorization";
import type { courseType } from "@/types/course";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

export type CourseRecordNavId =
  | "overview"
  | "schedule"
  | "attendance"
  | "grading"
  | "members"
  | "students"
  | "student-info"
  | "assessments"
  | "materials";

export type CourseRecordNavGroupId = "academic" | "roster";

export type CourseRecordNavGroup = {
  id: CourseRecordNavGroupId;
  label: string;
};

export const COURSE_RECORD_NAV_GROUPS: CourseRecordNavGroup[] = [
  { id: "academic", label: "Academic" },
  { id: "roster", label: "Roster" },
];

export type CourseRecordNavEntry = {
  id: CourseRecordNavId;
  label: string;
  /** Path segment after /courses/[id]/ — empty string for overview */
  segment: string;
  group?: CourseRecordNavGroupId;
  canShow?: (
    user: accountType,
    course: courseType,
    tenant: organizationType | null,
  ) => boolean;
};

export type CourseRecordNavSectionGroup = CourseRecordNavGroup & {
  entries: CourseRecordNavEntry[];
};

export type CourseRecordNavSections = {
  overview: CourseRecordNavEntry | null;
  groups: CourseRecordNavSectionGroup[];
};

/** Exclude from Course actions menu (rail entries + promoted header buttons). */
export const PANEL_OVERFLOW_EXCLUDED_HREFS = new Set([
  "attendance",
  "meeting-attendance",
  "grading",
  "edit",
]);

export const COURSE_RECORD_NAV_ENTRIES: CourseRecordNavEntry[] = [
  { id: "overview", label: "Overview", segment: "" },
  {
    id: "attendance",
    label: "Attendance",
    segment: "attendance",
    group: "academic",
    canShow: (user) =>
      canAccessCourseAttendance(user) ||
      permissionsFor(user).can("checkin.view_all"),
  },
  {
    id: "grading",
    label: "Grading",
    segment: "grading",
    group: "academic",
    canShow: (user) =>
      permissionsFor(user).canAny(["assignment.grade", "grade.manage"]),
  },
  {
    id: "assessments",
    label: "Assessments",
    segment: "assessments",
    group: "academic",
  },
  { id: "materials", label: "Materials", segment: "materials", group: "academic" },
  { id: "schedule", label: "Schedule", segment: "schedule", group: "roster" },
  { id: "members", label: "Members", segment: "members", group: "roster" },
  { id: "students", label: "Students", segment: "students", group: "roster" },
  {
    id: "student-info",
    label: "Student Info",
    segment: "student-info",
    group: "roster",
    canShow: (user) => !isStudent(user),
  },
];

const HUB_SEGMENTS = new Set(
  COURSE_RECORD_NAV_ENTRIES.filter((entry) => entry.segment).map(
    (entry) => entry.segment,
  ),
);

export function courseRecordHref(
  courseId: string,
  entry: CourseRecordNavEntry,
): string {
  if (!entry.segment) {
    return `/courses/${courseId}`;
  }
  return `/courses/${courseId}/${entry.segment}`;
}

export function visibleCourseRecordEntries(
  user: accountType | undefined,
  course: courseType,
  tenant: organizationType | null,
): CourseRecordNavEntry[] {
  return COURSE_RECORD_NAV_ENTRIES.filter((entry) => {
    if (!entry.canShow) {
      return true;
    }
    if (!user) {
      return false;
    }
    return entry.canShow(user, course, tenant);
  });
}

export function visibleCourseRecordNavSections(
  user: accountType | undefined,
  course: courseType,
  tenant: organizationType | null,
): CourseRecordNavSections {
  const entries = visibleCourseRecordEntries(user, course, tenant);
  const overview = entries.find((entry) => entry.id === "overview") ?? null;
  const groups = COURSE_RECORD_NAV_GROUPS.map((group) => ({
    ...group,
    entries: entries.filter((entry) => entry.group === group.id),
  })).filter((group) => group.entries.length > 0);

  return { overview, groups };
}

export function isCourseHubRoute(pathname: string, courseId: string): boolean {
  const base = `/courses/${courseId}`;
  if (!pathname.startsWith(base)) {
    return false;
  }
  const tail = pathname.slice(base.length).replace(/^\//, "");
  if (!tail) {
    return true;
  }
  const segments = tail.split("/").filter(Boolean);
  if (segments[0] === "student-info" || segments[0] === "grading") {
    return true;
  }
  if (segments.length !== 1) {
    return false;
  }
  return HUB_SEGMENTS.has(segments[0]);
}

export function courseRecordNavActive(
  id: CourseRecordNavId,
  pathname: string,
  courseId: string,
): boolean {
  const base = `/courses/${courseId}`;
  if (id === "overview") {
    return pathname === base || pathname === `${base}/`;
  }
  if (id === "attendance") {
    return (
      pathname.startsWith(`${base}/attendance`) ||
      pathname.startsWith(`${base}/checkin-history`) ||
      pathname.startsWith(`${base}/meeting-attendance`)
    );
  }
  const entry = COURSE_RECORD_NAV_ENTRIES.find((item) => item.id === id);
  if (!entry?.segment) {
    return false;
  }
  const prefix = `${base}/${entry.segment}`;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export const COURSE_CONTEXT_PARENT = {
  label: "Academic Hub",
  href: "/courses",
} as const;
