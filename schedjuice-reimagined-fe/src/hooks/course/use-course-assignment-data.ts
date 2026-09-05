import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { fetchEntity, fetchEntities, searchEntities } from "@/app/client-api/utils";
import type {
  CourseRoleOption,
  TeacherCandidate,
} from "@/components/course/teacher-assignment/types";
import {
  courseWeekdayIndices,
  toSessionOptions,
} from "@/helpers/course/session-grouping";
import { listToApiArray } from "@/helpers/filter-params";
import { useTenant } from "@/hooks/useTenant";
import { operatorEnum } from "@/types/api";
import { role } from "@/types/user";

export type AssignedTeacher = {
  userCourseId: number;
  user: TeacherCandidate;
  roleName: string | null;
  isSubstitute: boolean;
  autoRemoveOn: string | null;
  sessionCount: number;
};

export function useCourseAssignmentData(courseId: string | number) {
  const { tenant } = useTenant();
  const key = String(courseId);

  const eventsQuery = useQuery({
    queryKey: ["course-assignment-events", key],
    queryFn: () =>
      searchEntities(
        "events",
        { size: -1, sorts: ["date", "time_from"] },
        {
          filter_params: [
            {
              field_name: "course_id",
              operator: operatorEnum.exact,
              value: key,
            },
          ],
        },
      ),
  });

  const rosterQuery = useQuery({
    queryKey: ["course-assignment-roster", key],
    queryFn: () =>
      searchEntities(
        "user-courses",
        { size: -1, expand: ["user", "assigned_as_role"] },
        {
          filter_params: [
            {
              field_name: "course_id",
              operator: operatorEnum.exact,
              value: key,
            },
            {
              field_name: "user__roles",
              operator: operatorEnum.contains,
              value: listToApiArray([role.teacher]),
            },
          ],
        },
      ),
  });

  const userEventsQuery = useQuery({
    queryKey: ["course-assignment-user-events", key],
    queryFn: () =>
      searchEntities(
        "user-events",
        { size: -1, fields: ["id", "user", "event"] },
        {
          filter_params: [
            {
              field_name: "event__course_id",
              operator: operatorEnum.exact,
              value: key,
            },
          ],
        },
      ),
  });

  const rolesQuery = useQuery({
    queryKey: ["course-assignment-roles"],
    staleTime: 5 * 60_000,
    queryFn: () => fetchEntities("assigned-as-roles", { size: -1 }),
  });

  const courseQuery = useQuery({
    queryKey: ["course-assignment-course", key],
    queryFn: () => fetchEntity("courses", key),
  });

  const sessions = useMemo(
    () =>
      toSessionOptions(
        eventsQuery.data?.data?.data ?? [],
        tenant?.timezone,
      ),
    [eventsQuery.data, tenant?.timezone],
  );

  const courseWeekdays = useMemo(
    () =>
      courseWeekdayIndices(
        courseQuery.data?.data?.data?.repeat_every,
        sessions,
      ),
    [courseQuery.data, sessions],
  );

  const sessionCountByUser = useMemo(() => {
    const counts = new Map<number, number>();
    for (const row of userEventsQuery.data?.data?.data ?? []) {
      const userId = Number(
        typeof row.user === "object" ? row.user?.id : row.user,
      );
      if (!Number.isFinite(userId)) continue;
      counts.set(userId, (counts.get(userId) ?? 0) + 1);
    }
    return counts;
  }, [userEventsQuery.data]);

  const assignedTeachers: AssignedTeacher[] = useMemo(
    () =>
      (rosterQuery.data?.data?.data ?? []).map((row: {
        id: number;
        user: TeacherCandidate;
        assigned_as_role?: {
          name?: string;
          is_substitute?: boolean;
        };
        substitute_auto_remove_on?: string | null;
      }) => ({
        userCourseId: Number(row.id),
        user: row.user,
        roleName: row.assigned_as_role?.name ?? null,
        isSubstitute: Boolean(row.assigned_as_role?.is_substitute),
        autoRemoveOn: row.substitute_auto_remove_on ?? null,
        sessionCount: sessionCountByUser.get(Number(row.user?.id)) ?? 0,
      })),
    [rosterQuery.data, sessionCountByUser],
  );

  const roles: CourseRoleOption[] = useMemo(
    () =>
      (rolesQuery.data?.data?.data ?? []).map((row: {
        id: number;
        name: string;
        seniority?: CourseRoleOption["seniority"];
        is_substitute?: boolean;
        is_collision_enabled?: boolean;
      }) => ({
        id: Number(row.id),
        name: String(row.name),
        seniority: (row.seniority ?? "OTHER") as CourseRoleOption["seniority"],
        isSubstitute: Boolean(row.is_substitute),
        isCollisionEnabled: row.is_collision_enabled !== false,
      })),
    [rolesQuery.data],
  );

  return {
    sessions,
    courseWeekdays,
    roles,
    assignedTeachers,
    assignedUserIds: assignedTeachers.map((t) => Number(t.user.id)),
    isLoading:
      eventsQuery.isLoading ||
      rosterQuery.isLoading ||
      rolesQuery.isLoading ||
      courseQuery.isLoading,
    refetchAll: () => {
      void eventsQuery.refetch();
      void rosterQuery.refetch();
      void userEventsQuery.refetch();
      void rolesQuery.refetch();
      void courseQuery.refetch();
    },
  };
}
