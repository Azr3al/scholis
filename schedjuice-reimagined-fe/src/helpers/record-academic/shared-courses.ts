import { assignedRoleSeniorityCountsForTeachingStat } from "@/helpers/user-profile";
import { courseStatus } from "@/types/course";

type UserCourseLike = {
  course?: number | { id?: number; status?: string } | null;
  assigned_as_role?: { seniority?: string | null; name?: string } | null;
};

function courseIdFromRow(row: UserCourseLike): number | null {
  const c = row.course;
  if (c == null) return null;
  return typeof c === "object" ? (c.id ?? null) : c;
}

export function viewerTeachingCourseIds(
  viewerUserCourses: UserCourseLike[] | null | undefined,
): number[] {
  if (!viewerUserCourses?.length) return [];
  const out = new Set<number>();
  for (const row of viewerUserCourses) {
    if (!assignedRoleSeniorityCountsForTeachingStat(row.assigned_as_role?.seniority)) {
      continue;
    }
    const cid = courseIdFromRow(row);
    const st =
      typeof row.course === "object" && row.course != null ? row.course.status : null;
    if (cid == null) continue;
    if (st && st !== courseStatus.planned && st !== courseStatus.active) continue;
    out.add(cid);
  }
  return Array.from(out);
}

export function sharedCourseIds(
  viewerUserCourses: UserCourseLike[] | null | undefined,
  subjectUserCourses: UserCourseLike[] | null | undefined,
): number[] {
  const teaching = new Set(viewerTeachingCourseIds(viewerUserCourses));
  if (!teaching.size || !subjectUserCourses?.length) return [];
  const shared: number[] = [];
  for (const row of subjectUserCourses) {
    const cid = courseIdFromRow(row);
    if (cid != null && teaching.has(cid)) shared.push(cid);
  }
  return shared;
}

export function isSharedCourse(courseId: number, sharedIds: number[]): boolean {
  return sharedIds.includes(courseId);
}
