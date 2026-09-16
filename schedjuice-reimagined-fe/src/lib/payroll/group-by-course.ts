export type PayrollSessionRow = {
  course_id: number;
  course: string;
  hours?: number;
  is_extra?: boolean;
};

export type TrphillipsByCourseAggregate = Record<
  string | number,
  { earnings: number; total_hours: number }
>;

type SessionBasedCourseSummary = {
  courseId: number;
  courseTitle: string;
  sessionCount: number;
  perSessionRate: number;
  earnings: number;
};

type TrphillipsCourseSummary = {
  courseId: number;
  courseTitle: string;
  regularHours: number;
  extraHours: number;
  totalHours: number;
  earnings: number;
};

function lookupByCourseAggregate(
  byCourse: TrphillipsByCourseAggregate | undefined,
  courseId: number,
): { earnings: number; total_hours: number } | undefined {
  if (!byCourse) return undefined;
  return byCourse[courseId] ?? byCourse[String(courseId)];
}

export function buildSessionBasedCourseSummaries(
  rows: PayrollSessionRow[],
  perSessionRate: number,
): SessionBasedCourseSummary[] {
  const buckets = new Map<
    number,
    { courseTitle: string; sessionCount: number }
  >();

  for (const row of rows) {
    const existing = buckets.get(row.course_id);
    if (existing) {
      existing.sessionCount += 1;
    } else {
      buckets.set(row.course_id, {
        courseTitle: row.course,
        sessionCount: 1,
      });
    }
  }

  const summaries: SessionBasedCourseSummary[] = [];
  buckets.forEach(({ courseTitle, sessionCount }, courseId) => {
    summaries.push({
      courseId,
      courseTitle,
      sessionCount,
      perSessionRate,
      earnings: sessionCount * perSessionRate,
    });
  });

  return summaries.sort((a, b) =>
    a.courseTitle.localeCompare(b.courseTitle),
  );
}

export function buildTrphillipsCourseSummaries(
  rows: PayrollSessionRow[],
  byCourseAggregate: TrphillipsByCourseAggregate | undefined,
): TrphillipsCourseSummary[] {
  const buckets = new Map<
    number,
    { courseTitle: string; regularHours: number; extraHours: number }
  >();

  for (const row of rows) {
    const hours = row.hours ?? 0;
    const existing = buckets.get(row.course_id);
    if (existing) {
      if (row.is_extra) {
        existing.extraHours += hours;
      } else {
        existing.regularHours += hours;
      }
    } else {
      buckets.set(row.course_id, {
        courseTitle: row.course,
        regularHours: row.is_extra ? 0 : hours,
        extraHours: row.is_extra ? hours : 0,
      });
    }
  }

  const summaries: TrphillipsCourseSummary[] = [];
  buckets.forEach(({ courseTitle, regularHours, extraHours }, courseId) => {
    const totalHours = regularHours + extraHours;
    const courseAgg = lookupByCourseAggregate(byCourseAggregate, courseId);
    summaries.push({
      courseId,
      courseTitle,
      regularHours,
      extraHours,
      totalHours,
      earnings: courseAgg?.earnings ?? 0,
    });
  });

  return summaries.sort((a, b) =>
    a.courseTitle.localeCompare(b.courseTitle),
  );
}
