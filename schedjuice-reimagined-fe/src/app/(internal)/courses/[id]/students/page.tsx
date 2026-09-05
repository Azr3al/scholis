"use client";
import { Button, Checkbox, Skeleton, useToast } from "@/components/primitives";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash } from "iconoir-react";
import Link from "next/link";

import { CourseStudentAddBar } from "@/components/course/course-student-add-bar";
import { CourseStudentBulkRemoveBar } from "@/components/course/course-student-bulk-remove-bar";
import {
  CourseStudentBulkRemoveDialog,
} from "@/components/course/course-student-bulk-remove-dialog";
import { CourseStudentPastePanel } from "@/components/course/course-student-paste-panel";
import {
  CourseStudentRemoveDialog,
  CourseStudentRemoveTarget,
} from "@/components/course/course-student-remove-dialog";
import { FormSaveTick } from "@/components/product-docs/form-save-tick";
import {
  ResourceTable,
  column,
  useResourceTableState,
  type Column,
} from "@/components/data-table";
import { useCourseHub } from "@/contexts/course-hub-context";
import { canManageCourseRoster, isStudent, permissionsFor } from "@/helpers/authorization";
import { getCreatedByIdFromCourse } from "@/helpers/course-hub";
import { copyVisibleColumnValues } from "@/helpers/copy-visible-column-values";
import { useCourseStudentRoster } from "@/hooks/use-course-student-roster";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { normalizeEmail } from "@/lib/course/bulk-student-email-resolve";
import { operatorEnum } from "@/types/api";
import type { UserCourse } from "@/sdk";
import { useUserCoursesList } from "@/sdk/hooks/user-courses";

const TICK_MS = 2000;

function userFromRow(row: UserCourse) {
  return typeof row.user === "object" && row.user ? row.user : null;
}

export default function CourseStudentsPage() {
  const { user } = useUser();
  const { tenant } = useTenant();
  const toast = useToast();
  const { courseId, course, isCourseLoading, teacherMemberIds } =
    useCourseHub();

  const [studentToRemove, setStudentToRemove] =
    useState<CourseStudentRemoveTarget | null>(null);
  const [bulkRemoveTargets, setBulkRemoveTargets] = useState<
    CourseStudentRemoveTarget[] | null
  >(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showRemovedTick, setShowRemovedTick] = useState(false);
  const [removedTickLabel, setRemovedTickLabel] = useState("Removed");
  const [rosterEmails, setRosterEmails] = useState<Set<string>>(new Set());
  const removedTickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const canManageStudents = Boolean(
    user &&
      course &&
      canManageCourseRoster(
        user,
        teacherMemberIds,
        getCreatedByIdFromCourse(course),
      ),
  );

  const requiresMsLink = Boolean(
    tenant?.is_microsoft_on && tenant?.is_teams_creation_enabled,
  );
  const canLinkMicrosoft = Boolean(
    user && permissionsFor(user).can("user.update"),
  );

  const numericCourseId = Number(courseId);
  const {
    addStudent,
    removeStudent,
    bulkAddStudents,
    bulkRemoveStudents,
    isPending,
  } = useCourseStudentRoster(
    Number.isFinite(numericCourseId) ? numericCourseId : undefined,
  );

  const flashRemovedTick = useCallback((label = "Removed") => {
    if (removedTickTimerRef.current) {
      clearTimeout(removedTickTimerRef.current);
    }
    setRemovedTickLabel(label);
    setShowRemovedTick(true);
    removedTickTimerRef.current = setTimeout(
      () => setShowRemovedTick(false),
      TICK_MS,
    );
  }, []);

  useEffect(() => {
    return () => {
      if (removedTickTimerRef.current) {
        clearTimeout(removedTickTimerRef.current);
      }
    };
  }, []);

  const filterParams = useMemo(
    () => [
      {
        field_name: "course_id",
        operator: operatorEnum.exact,
        value: courseId,
      },
      {
        field_name: "assigned_as",
        operator: operatorEnum.exact,
        value: "student",
      },
    ],
    [courseId],
  );

  const tableState = useResourceTableState({
    namespace: `getStudentsOfCourse-${courseId}`,
    syncUrl: false,
    initial: { pageSize: 100 },
  });
  const list = useUserCoursesList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
    expand: ["user"],
    student_roster_order: true,
    filterParams,
  });

  useEffect(() => {
    setRosterEmails(
      new Set(
        list.rows
          .map((row) => {
            const u = userFromRow(row);
            return u?.email ? normalizeEmail(u.email) : "";
          })
          .filter(Boolean),
      ),
    );
  }, [list.rows]);

  const selectedStudents = useMemo(() => {
    return list.rows
      .map((row) => {
        const u = userFromRow(row);
        if (!u || !selectedIds.has(u.id)) return null;
        return { id: u.id, name: u.name ?? "" };
      })
      .filter((x): x is CourseStudentRemoveTarget => x != null);
  }, [list.rows, selectedIds]);

  const toggleSelected = useCallback((userId: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }, []);

  const toggleAllOnPage = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const row of list.rows) {
          const u = userFromRow(row);
          if (!u) continue;
          if (checked) next.add(u.id);
          else next.delete(u.id);
        }
        return next;
      });
    },
    [list.rows],
  );

  const handleBulkAdd = useCallback(
    (userIds: number[]) =>
      new Promise<void>((resolve, reject) => {
        bulkAddStudents.mutate(userIds, {
          onSuccess: () => {
            list.refetch();
            resolve();
          },
          onError: () => reject(new Error("bulk add failed")),
        });
      }),
    [bulkAddStudents, list],
  );

  const hideProfileLink = Boolean(user && isStudent(user));

  const copyRosterColumn = useCallback(
    (field: "name" | "email") => {
      if (list.rows.length === 0) {
        toast.add({ description: "Nothing to copy" });
        return;
      }
      const values = list.rows.map((row) => {
        const u = userFromRow(row);
        const raw = field === "name" ? u?.name : u?.email;
        return raw?.trim() ?? "";
      });
      const text = copyVisibleColumnValues(values);
      const n = text === "" ? 0 : text.split("\n").length;
      void navigator.clipboard.writeText(text).then(
        () =>
          toast.add({
            description: `Copied ${n} ${field === "name" ? "names" : "emails"}`,
          }),
        () => toast.add({ description: "Could not copy to clipboard" }),
      );
    },
    [list.rows, toast],
  );

  const columns: Column<UserCourse>[] = useMemo(() => {
    const cols: Column<UserCourse>[] = [];
    if (canManageStudents) {
      const allOnPageSelected =
        list.rows.length > 0 &&
        list.rows.every((row) => {
          const u = userFromRow(row);
          return u ? selectedIds.has(u.id) : true;
        });
      cols.push({
        id: "select",
        header: (
          <Checkbox
            checked={allOnPageSelected}
            onCheckedChange={(v) => toggleAllOnPage(Boolean(v))}
            aria-label="Select all students on page"
          />
        ),
        accessor: () => null,
        enableSorting: false,
        cell: ({ row }) => {
          const u = userFromRow(row);
          if (!u) return null;
          return (
            <Checkbox
              checked={selectedIds.has(u.id)}
              onCheckedChange={(v) => toggleSelected(u.id, Boolean(v))}
              aria-label={`Select ${u.name ?? "student"}`}
            />
          );
        },
      });
    }
    cols.push(
      column.text<UserCourse>({
        id: "user__name",
        header: "Name",
        accessor: (row) => userFromRow(row)?.name,
        headerMenu: {
          copy: true,
          onCopy: () => copyRosterColumn("name"),
        },
      }),
      column.text<UserCourse>({
        id: "user__email",
        header: "Email",
        accessor: (row) => userFromRow(row)?.email,
        headerMenu: {
          copy: true,
          onCopy: () => copyRosterColumn("email"),
        },
      }),
      column.text<UserCourse>({
        id: "user__alternative_name",
        header: "Alternate name",
        accessor: (row) => userFromRow(row)?.alternative_name,
      }),
    );
    if (canManageStudents) {
      cols.push({
        id: "remove",
        header: "",
        accessor: () => null,
        enableSorting: false,
        cell: ({ row }) => {
          const u = userFromRow(row);
          if (!u) return null;
          return (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-danger hover:bg-danger/10 hover:text-danger"
              aria-label={`Remove ${u.name} from class`}
              disabled={isPending}
              onClick={() =>
                setStudentToRemove({
                  id: u.id,
                  name: u.name ?? "",
                })
              }
            >
              <Trash className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Button>
          );
        },
      });
    }
    if (!hideProfileLink) {
      cols.push({
        id: "open",
        header: "",
        accessor: () => null,
        enableSorting: false,
        cell: ({ row }) => {
          const u = userFromRow(row);
          if (!u) return null;
          return (
            <Link
              href={`/users/${u.id}`}
              className="text-sm text-brand underline-offset-2 hover:underline"
            >
              Open
            </Link>
          );
        },
      });
    }
    return cols;
  }, [
    canManageStudents,
    copyRosterColumn,
    hideProfileLink,
    isPending,
    list.rows,
    selectedIds,
    toggleAllOnPage,
    toggleSelected,
  ]);

  if (isCourseLoading) {
    return <Skeleton className="min-h-[200px] w-full rounded-xl" aria-busy />;
  }

  if (!user) {
    return null;
  }

  if (!course.id) {
    return (
      <p className="text-sm text-text-secondary" role="alert">
        Course could not be loaded.
      </p>
    );
  }

  return (
    <>
      {canManageStudents ? (
        <div className="flex flex-col gap-3">
          <div className="flex w-full min-w-0 flex-wrap items-end justify-between gap-3">
            <CourseStudentAddBar
              courseId={numericCourseId}
              addStudent={addStudent}
              disabled={isPending}
            />
            <FormSaveTick visible={showRemovedTick} label={removedTickLabel} />
          </div>
          <CourseStudentPastePanel
            rosterEmails={rosterEmails}
            requiresMsLink={requiresMsLink}
            canLinkMicrosoft={canLinkMicrosoft}
            disabled={isPending}
            onAdd={handleBulkAdd}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium uppercase tracking-wide text-text-secondary">
          Students
        </p>
        {canManageStudents ? (
          <CourseStudentBulkRemoveBar
            count={selectedStudents.length}
            disabled={isPending}
            onClear={() => setSelectedIds(new Set())}
            onRemove={() => setBulkRemoveTargets(selectedStudents)}
          />
        ) : null}
        <ResourceTable
          list={list}
          tableState={tableState}
          columns={columns}
          getRowId={(row) => {
            const u = userFromRow(row);
            return u ? String(u.id) : String(row.id);
          }}
        />
      </div>

      <CourseStudentRemoveDialog
        student={studentToRemove}
        isLoading={removeStudent.isPending}
        onOpenChange={(open) => {
          if (!open && removeStudent.isPending) {
            return;
          }
          if (!open) {
            setStudentToRemove(null);
          }
        }}
        onConfirm={() => {
          if (!studentToRemove) {
            return;
          }
          removeStudent.mutate(studentToRemove.id, {
            onSuccess: () => {
              setStudentToRemove(null);
              flashRemovedTick();
              list.refetch();
            },
          });
        }}
      />

      <CourseStudentBulkRemoveDialog
        students={bulkRemoveTargets}
        isLoading={bulkRemoveStudents.isPending}
        onOpenChange={(open) => {
          if (!open && bulkRemoveStudents.isPending) {
            return;
          }
          if (!open) {
            setBulkRemoveTargets(null);
          }
        }}
        onConfirm={() => {
          if (!bulkRemoveTargets?.length) {
            return;
          }
          const count = bulkRemoveTargets.length;
          bulkRemoveStudents.mutate(
            bulkRemoveTargets.map((student) => student.id),
            {
              onSuccess: () => {
                setBulkRemoveTargets(null);
                setSelectedIds(new Set());
                flashRemovedTick(
                  `Removed ${count} student${count === 1 ? "" : "s"}`,
                );
                list.refetch();
              },
            },
          );
        }}
      />
    </>
  );
}
