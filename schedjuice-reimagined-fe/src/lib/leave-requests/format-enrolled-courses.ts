import type { LeaveRequestCourse } from "@/sdk/_types/leave-requests";

export function formatEnrolledCourses(
  courses: LeaveRequestCourse[] | undefined,
): string | null {
  if (!courses?.length) {
    return null;
  }

  if (courses.length <= 2) {
    return courses.map((course) => course.title).join(" · ");
  }

  const [first, second, ...rest] = courses;
  return `${first.title} · ${second.title} · +${rest.length} more`;
}
