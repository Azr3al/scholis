export type ScheduleRowAction =
  | { kind: "check_in"; courseId: number }
  | { kind: "check_out"; courseId: number }
  | { kind: "mark"; href: string }
  | { kind: "settled"; label: string }
  | { kind: "none" };

export function resolveScheduleRowAction(input: {
  courseId: number;
  useTeacherSessionCheckin: boolean;
  checkinAction: "check_in" | "check_out" | "none";
  markingHref: string | null;
  settledLabel?: string | null;
}): ScheduleRowAction {
  if (input.useTeacherSessionCheckin) {
    if (input.checkinAction === "check_in") {
      return { kind: "check_in", courseId: input.courseId };
    }
    if (input.checkinAction === "check_out") {
      return { kind: "check_out", courseId: input.courseId };
    }
  }
  if (input.settledLabel) return { kind: "settled", label: input.settledLabel };
  if (input.markingHref) return { kind: "mark", href: input.markingHref };
  return { kind: "none" };
}
