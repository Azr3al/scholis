export type CourseScheduleLike = {
  weekday_pattern?: string | null;
  time_pattern?: string | null;
  first_event_time_from?: string | null;
  first_event_time_to?: string | null;
};

function formatClock(time: string): string {
  return time.trim().slice(0, 5);
}

export function formatCourseSchedulePattern(
  course: CourseScheduleLike,
): string | null {
  const days = course.weekday_pattern?.trim();
  const from = course.first_event_time_from;
  const to = course.first_event_time_to;
  if (!days && !from) return null;
  const time =
    from && to
      ? `${formatClock(from)}–${formatClock(to)}`
      : (course.time_pattern?.trim() ?? null);
  if (days && time) return `${days} ${time}`;
  return days ?? time;
}
