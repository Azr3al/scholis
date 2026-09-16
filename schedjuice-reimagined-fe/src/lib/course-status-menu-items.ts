import { courseStatus } from "@/types/course";

export type CourseStatusMenuAction = "pause" | "resume" | "end" | "reactivate";

export function getCourseStatusMenuItems(
  status: courseStatus,
): CourseStatusMenuAction[] {
  switch (status) {
    case courseStatus.active:
      return ["pause", "end"];
    case courseStatus.paused:
      return ["resume", "end"];
    case courseStatus.planned:
      return ["end"];
    case courseStatus.ended:
      return ["reactivate"];
    default:
      return [];
  }
}
