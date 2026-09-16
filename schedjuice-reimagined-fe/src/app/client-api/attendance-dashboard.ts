import { axiosClient } from "@/lib/api";
import {
  parseMonthlyAttendanceResponse,
  type MonthlyAttendanceMatrixResponse,
} from "@/helpers/attendance-dashboard";
import type { CourseAttendanceSummary } from "@/types/attendance";

export type { MonthlyAttendanceMatrixResponse };

export async function getMonthlyAttendanceMatrix(
  courseId: string | number,
  dateRange: string,
  includeRemovedStudents = false,
): Promise<MonthlyAttendanceMatrixResponse> {
  const res = await axiosClient.get<{
    data: string[][] | Record<string, never>;
    students?: Array<{ id: number; name: string; is_removed: boolean }>;
  }>(`attendances/monthly-attendance/${courseId}/${dateRange}`, {
    params: {
      size: -1,
      ...(includeRemovedStudents
        ? { include_removed_students: "true" }
        : {}),
    },
  });
  return parseMonthlyAttendanceResponse(res.data);
}

export async function getCourseAttendanceSummary(
  courseId: string | number,
  includeRemovedStudents = false,
): Promise<CourseAttendanceSummary> {
  const res = await axiosClient.get<{ data: CourseAttendanceSummary }>(
    `attendances/course-summary/${courseId}`,
    {
      params: includeRemovedStudents
        ? { include_removed_students: "true" }
        : undefined,
    },
  );
  return res.data.data;
}
