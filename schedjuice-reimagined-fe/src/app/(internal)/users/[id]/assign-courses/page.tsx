"use client";
import {
  Button,
  Checkbox,
  Select,
  Skeleton,
  Switch,
  useToast,
} from "@/components/primitives";

import { PageContainer } from "@/components/layout/page-container";
import {
  fetchEntity,
  makeGetRequest,
  makePostRequest,
} from "@/app/client-api/utils";
import BackButton from "@/components/misc/back-button";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import {
  ResourceTable,
  column,
  useResourceTableState,
  type Column,
} from "@/components/data-table";
import { Field } from "@/components/primitives";
import { userHasRoles } from "@/helpers/authorization";
import { invalidateCourseSummaryCaches } from "@/lib/course-cache";
import { queryClient } from "@/lib/query";
import { operatorEnum } from "@/types/api";
import { role } from "@/types/user";
import type { Course, UserCourse } from "@/sdk";
import { useCoursesList } from "@/sdk/hooks/courses";
import { useUserCoursesList } from "@/sdk/hooks/user-courses";
import { userCoursesKeys } from "@/sdk/keys/user-courses";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTenant } from "@/hooks/useTenant";

const AssignCoursesPage: React.FC = () => {
  const [isAddMode, setIsAddMode] = useState(false);
  const [userCoursesState, setUserCoursesState] = useState<Record<string, string>>({});
  const [selectedUserCourseIds, setSelectedUserCourseIds] = useState<Set<number>>(new Set());
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<number>>(new Set());

  const { id } = useParams<{ id: string }>();
  const { tenant } = useTenant();
  const courseRolesEnabled = tenant?.is_course_role_enabled !== false;
  const getUser = useQuery({
    queryKey: ["getUser", id],
    queryFn: () => fetchEntity(`users`, id),
  });

  const toast = useToast();
  const getAllAssignedAsRoles = useQuery({
    queryKey: ["getAllAssignedAsRoles"],
    queryFn: () =>
      makeGetRequest("assigned-as-roles", { size: -1, sorts: ["name"] }),
  });

  const updateUserMutation = useMutation({
    mutationKey: ["updateUser", id],
    mutationFn: (data: Record<string, unknown>[]) =>
      makePostRequest("user-courses/management", data),
  });

  const getUserType = (user: Parameters<typeof userHasRoles>[0]) => {
    if (userHasRoles(user, [role.student])) {
      return "student";
    }
    return "teacher";
  };

  useEffect(() => {
    setUserCoursesState({});
    setSelectedUserCourseIds(new Set());
    setSelectedCourseIds(new Set());
  }, [isAddMode]);

  const userCoursesFilter = useMemo(
    () => [
      {
        field_name: "user_id",
        operator: operatorEnum.exact,
        value: id,
      },
    ],
    [id],
  );

  const userCoursesTableState = useResourceTableState({
    namespace: "user-courses",
    syncUrl: false,
  });
  const userCoursesList = useUserCoursesList({
    page: userCoursesTableState.page,
    pageSize: userCoursesTableState.pageSize,
    sorts: userCoursesTableState.sorts,
    q: userCoursesTableState.q,
    expand: ["course", "assigned_as_role"],
    filterParams: userCoursesFilter,
    enabled: !isAddMode && !getUser.isLoading,
  });

  const coursesTableState = useResourceTableState({
    namespace: "get-user-courses",
    syncUrl: false,
    initial: { sorts: ["-created_at"] },
  });
  const coursesList = useCoursesList({
    page: coursesTableState.page,
    pageSize: coursesTableState.pageSize,
    sorts: coursesTableState.sorts.length
      ? coursesTableState.sorts
      : ["-created_at"],
    q: coursesTableState.q,
    filterParams: {
      exclude_params: [
        {
          field_name: "user_courses__user_id",
          operator: operatorEnum.exact,
          value: id,
        },
      ],
    },
    enabled: isAddMode && !getUser.isLoading,
  });

  const isTeacher =
    getUser.data?.data.data &&
    getUserType(getUser.data.data.data) === "teacher";

  const userCourseColumns: Column<UserCourse>[] = useMemo(() => {
    const cols: Column<UserCourse>[] = [
      {
        id: "select",
        header: "",
        accessor: () => null,
        enableSorting: false,
        cell: ({ row }) => (
          <Checkbox
            checked={selectedUserCourseIds.has(row.id)}
            onCheckedChange={(v) => {
              setSelectedUserCourseIds((prev) => {
                const next = new Set(prev);
                if (v) next.add(row.id);
                else next.delete(row.id);
                return next;
              });
            }}
            aria-label="Select assignment"
          />
        ),
      },
    ];
    if (isTeacher && courseRolesEnabled) {
      cols.push(
        column.text<UserCourse>({
          id: "assigned_as",
          header: "Assigned as",
          accessor: (row) => row.assigned_as_role?.name,
        }),
      );
    }
    cols.push(
      column.text<UserCourse>({
        id: "course",
        header: "Course",
        accessor: (row) =>
          typeof row.course === "object" ? row.course?.title : null,
      }),
    );
    return cols;
  }, [courseRolesEnabled, isTeacher, selectedUserCourseIds]);

  const courseColumns: Column<Course>[] = useMemo(() => {
    const cols: Column<Course>[] = [
      {
        id: "select",
        header: "",
        accessor: () => null,
        enableSorting: false,
        cell: ({ row }) => (
          <Checkbox
            checked={selectedCourseIds.has(row.id)}
            onCheckedChange={(v) => {
              setSelectedCourseIds((prev) => {
                const next = new Set(prev);
                if (v) next.add(row.id);
                else next.delete(row.id);
                return next;
              });
            }}
            aria-label={`Select ${row.title ?? "course"}`}
          />
        ),
      },
      column.text<Course>({
        id: "title",
        header: "Course",
        accessor: (row) => row.title,
      }),
    ];
    if (isTeacher && courseRolesEnabled) {
      cols.push({
        id: "role",
        header: "Assigned as",
        accessor: () => null,
        enableSorting: false,
        cell: ({ row }) => {
          const roles =
            getAllAssignedAsRoles.isLoading || getAllAssignedAsRoles.isFetching
              ? []
              : (getAllAssignedAsRoles.data?.data.data as
                  | {
                      id: number;
                      name: string;
                      is_collision_enabled: boolean;
                    }[]
                  | undefined) ?? [];
          const collisionIds = new Set(
            roles
              .filter((r) => r.is_collision_enabled)
              .map((r) => String(r.id)),
          );
          return (
            <Select
              className="w-[180px]"
              placeholder="Change selected"
              items={roles.map((assignedRole) => ({
                value: String(assignedRole.id),
                label: assignedRole.is_collision_enabled ? (
                  <span className="text-destructive">{assignedRole.name}</span>
                ) : (
                  assignedRole.name
                ),
              }))}
              value={String(userCoursesState[row.id] ?? "") || null}
              onValueChange={(v) => {
                if (v == null) return;
                const value = String(v);
                if (collisionIds.has(value)) return;
                setUserCoursesState((prev) => ({
                  ...prev,
                  [row.id]: value,
                }));
              }}
            />
          );
        },
      });
    }
    return cols;
  }, [
    courseRolesEnabled,
    getAllAssignedAsRoles.data,
    getAllAssignedAsRoles.isFetching,
    getAllAssignedAsRoles.isLoading,
    isTeacher,
    selectedCourseIds,
    userCoursesState,
  ]);

  const handleRemove = () => {
    const toBeDeletedUserCourses: Record<string, unknown>[] = [];
    for (const row of userCoursesList.rows) {
      if (!selectedUserCourseIds.has(row.id)) continue;
      toBeDeletedUserCourses.push({
        user: typeof row.user === "object" ? row.user?.id : row.user,
        course: typeof row.course === "object" ? row.course?.id : row.course,
        id: row.assigned_as_role?.id,
        isRemoved: true,
      });
    }
    if (!toBeDeletedUserCourses.length) return;

    updateUserMutation.mutate(toBeDeletedUserCourses, {
      onSuccess: () => {
        toast.add({
          description: "Successfully removed course member assignments.",
        });
        setSelectedUserCourseIds(new Set());
        userCoursesList.refetch();
        void queryClient.invalidateQueries({ queryKey: userCoursesKeys.all });
        void queryClient.invalidateQueries({
          queryKey: ["profileEnrollmentCounts", id],
        });
        void queryClient.invalidateQueries({
          queryKey: ["profileCourseList", id],
        });
        void queryClient.invalidateQueries({
          queryKey: ["profileTeachingCount", id],
        });
      },
    });
  };

  const handleAdd = () => {
    let isError = false;
    const toBeUpdatedUserCourses: Record<string, unknown>[] = [];
    const userType = getUserType(getUser.data?.data.data);
    for (const row of coursesList.rows) {
      if (!selectedCourseIds.has(row.id)) continue;
      if (userType === "student") {
        toBeUpdatedUserCourses.push({
          user: id,
          course: row.id,
          assigned_as: userType,
        });
        continue;
      }
      if (!courseRolesEnabled) {
        toBeUpdatedUserCourses.push({
          user: id,
          course: row.id,
          assigned_as: userType,
        });
        continue;
      }
      if (userCoursesState[row.id]) {
        toBeUpdatedUserCourses.push({
          ...row,
          user: id,
          course: row.id,
          assigned_as_role: Number(userCoursesState[row.id]),
          assigned_as: userType,
        });
      } else {
        isError = true;
      }
    }
    if (isError && userType === "teacher" && courseRolesEnabled) {
      toast.add({
        description: "Please assign a course role to all selected courses.",
      });
      return;
    }
    if (!toBeUpdatedUserCourses.length) return;

    updateUserMutation.mutate(toBeUpdatedUserCourses, {
      onSuccess: () => {
        toast.add({
          description: "Successfully updated course member assignments.",
        });
        setSelectedCourseIds(new Set());
        coursesList.refetch();
        userCoursesList.refetch();
        void queryClient.invalidateQueries({ queryKey: userCoursesKeys.all });
        void invalidateCourseSummaryCaches(queryClient);
        void queryClient.invalidateQueries({
          queryKey: ["profileEnrollmentCounts", id],
        });
        void queryClient.invalidateQueries({
          queryKey: ["profileCourseList", id],
        });
        void queryClient.invalidateQueries({
          queryKey: ["profileTeachingCount", id],
        });
        void queryClient.invalidateQueries({
          queryKey: ["profileUpcomingEvents", id],
        });
      },
    });
  };

  return (
    <PageContainer width="narrow" className="space-y-3">
      <BackButton href={`/users/${id}?section=academic`} />
      {getUser.isFetching || getUser.isLoading ? (
        <div className="space-y-4" aria-busy="true">
          <div className="space-y-2">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-4 w-full max-w-xl" />
          </div>
          <Skeleton className="h-4 w-full max-w-2xl" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-11 rounded-full" />
          </div>
          <TableSkeleton columns={3} rows={6} />
        </div>
      ) : (
        <>
          <div>
            <h1 className="text-3xl font-bold">Assign Courses</h1>
            <p>
              {isAddMode
                ? "You are currently assigning courses to the user."
                : "You are currently viewing the user's existing courses."}
            </p>
          </div>
          {getUserType(getUser.data?.data.data) === "teacher" &&
            courseRolesEnabled && (
            <p className="text-sm text-text-secondary">
              In this page, the user can only be assigned to courses with a non-collidable
              course role. If you want to assign with a collidable course role, go to the
              course's edit page instead.
            </p>
          )}
          <div className="flex items-center gap-3">
            <Field.Label>Add more</Field.Label>
            <Switch checked={isAddMode} onCheckedChange={(c) => setIsAddMode(c)} />
          </div>
          {!isAddMode ? (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleRemove}
                  isLoading={updateUserMutation.isPending}
                  disabled={selectedUserCourseIds.size === 0}
                >
                  Remove
                </Button>
              </div>
              <ResourceTable
                list={userCoursesList}
                tableState={userCoursesTableState}
                columns={userCourseColumns}
                getRowId={(row) => String(row.id)}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleAdd}
                  isLoading={updateUserMutation.isPending}
                  disabled={selectedCourseIds.size === 0}
                >
                  Add
                </Button>
              </div>
              <ResourceTable
                list={coursesList}
                tableState={coursesTableState}
                columns={courseColumns}
                getRowId={(row) => String(row.id)}
              />
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
};

export default AssignCoursesPage;
