"use client";

import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDebouncedCallback } from "use-debounce";
import { EditPencil, Search } from "iconoir-react";
import { Button, Input, useToast } from "@/components/primitives";
import {
  EmptyCopy,
  EmptyState,
  EMPTY_COPY_PRESETS,
} from "@/components/primitives/empty";
import { UserFieldHistorySheet } from "@/components/record/user-field-history-sheet";
import { useCellAutosave } from "@/components/edit-kit/use-cell-autosave";
import { useCourseHub } from "@/contexts/course-hub-context";
import { canEditCourse } from "@/helpers/authorization";
import { getCreatedByIdFromCourse } from "@/helpers/course-hub";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { useUser } from "@/hooks/useUser";
import { updateEntity } from "@/app/client-api/utils";
import { STEWARD_FIELD_LABELS } from "@/lib/users/steward-fields";
import { userCoursesKeys } from "@/sdk/keys/user-courses";
import {
  courseOperationalTableBodyCellClassName,
  courseOperationalTableClassName,
  courseOperationalTableHeadCellClassName,
  courseOperationalTableHeadRowClassName,
  courseOperationalTableShellClassName,
} from "@/lib/ui-remediation/r9-course-record-layout-classes";
import { cn } from "@/lib/utils";
import { operatorEnum } from "@/types/api";
import type { accountType } from "@/types/user";
import type { UserCourse } from "@/sdk";
import { useUserCoursesList } from "@/sdk/hooks/user-courses";

export function courseRosterStewardEnabled(
  viewer: accountType,
  ctx: { teacherMemberIds: number[]; createdById?: number | null },
): boolean {
  return canEditCourse(viewer, ctx.teacherMemberIds, ctx.createdById ?? null);
}

export function matchesCourseProfileSearch(
  student: {
    name?: string | null;
    alternative_name?: string | null;
    email?: string | null;
    communication_email?: string | null;
  },
  q: string,
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    student.name,
    student.alternative_name,
    student.email,
    student.communication_email,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

export function patchUserCourseUserField(
  data: unknown,
  userId: number,
  field: string,
  next: string,
): unknown {
  if (!data || typeof data !== "object" || !("rows" in data)) return data;
  const rows = (data as { rows: unknown }).rows;
  if (!Array.isArray(rows)) return data;
  return {
    ...data,
    rows: rows.map((row) => {
      if (!row || typeof row !== "object" || !("user" in row)) return row;
      const nested = (row as UserCourse).user;
      if (!nested || typeof nested !== "object" || nested.id !== userId) {
        return row;
      }
      return { ...row, user: { ...nested, [field]: next } };
    }),
  };
}

type ProfileRosterUser = {
  id: number;
  name?: string | null;
  alternative_name?: string | null;
  email?: string | null;
  communication_email?: string | null;
  phone_number?: string | null;
};

function userFromRow(row: UserCourse): ProfileRosterUser | null {
  const nested = typeof row.user === "object" && row.user ? row.user : null;
  if (!nested?.id) return null;
  return nested as ProfileRosterUser;
}

function StewardTextCell({
  userId,
  field,
  value,
  canEdit,
  required,
}: {
  userId: number;
  field: string;
  value: string | null | undefined;
  canEdit: boolean;
  required?: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const cancelingRef = useRef(false);
  const label = STEWARD_FIELD_LABELS[field] ?? field;
  const current = value ?? "";

  const autosave = useCellAutosave({
    value: current,
    onSave: async (next) => {
      await updateEntity("users", userId, { [field]: next });
      void queryClient.invalidateQueries({ queryKey: userCoursesKeys.all });
    },
    onOptimisticUpdate: (next) => {
      queryClient.setQueriesData(
        { queryKey: userCoursesKeys.lists() },
        (old) => patchUserCourseUserField(old, userId, field, next),
      );
    },
    onRollback: (previous) => {
      queryClient.setQueriesData(
        { queryKey: userCoursesKeys.lists() },
        (old) => patchUserCourseUserField(old, userId, field, previous),
      );
    },
    onError: (error) => {
      toast.add({
        title: "Could not save",
        description: parseSchedjuiceApiError(error, "Could not save this field."),
      });
    },
  });

  const display = autosave.displayValue;

  if (!canEdit) {
    return (
      <span className="block min-h-[2.25rem] py-1.5 text-sm text-text-primary">
        {display ? display : <span className="text-text-muted">—</span>}
      </span>
    );
  }

  function startEdit() {
    cancelingRef.current = false;
    autosave.setLocalValue(display);
    setEditing(true);
  }

  function finish(next: string) {
    if (cancelingRef.current) {
      cancelingRef.current = false;
      return;
    }
    setEditing(false);
    if (required && !next.trim()) {
      autosave.setLocalValue(current);
      toast.add({
        title: "Name is required",
        description: "Enter a full name before saving.",
      });
      return;
    }
    autosave.setLocalValue(next);
    void autosave.commit();
  }

  function cancel() {
    cancelingRef.current = true;
    autosave.setLocalValue(current);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        value={autosave.displayValue}
        aria-label={label}
        onChange={(event) => autosave.setLocalValue(event.target.value)}
        onBlur={(event) => finish(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.target as HTMLInputElement).blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
        className={cn(
          "w-full min-w-40 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      aria-label={`Edit ${label.toLowerCase()}`}
      className="group flex min-h-[2.25rem] w-full min-w-40 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
    >
      <span className="min-w-0 truncate">
        {display ? display : <span className="text-text-muted">—</span>}
      </span>
      {autosave.status === "saving" ? (
        <span className="shrink-0 text-xs text-text-muted">Saving</span>
      ) : autosave.showSavedTick ? (
        <span className="shrink-0 text-xs text-success">Saved</span>
      ) : (
        <EditPencil
          width={14}
          height={14}
          className="shrink-0 text-text-muted opacity-0 transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-out-soft)] group-hover:opacity-100"
          aria-hidden
        />
      )}
    </button>
  );
}

export function CourseStudentInfoProfile() {
  const { user } = useUser();
  const { courseId, course, teacherMemberIds } = useCourseHub();
  const [search, setSearch] = useState("");
  const [historyStudent, setHistoryStudent] =
    useState<ProfileRosterUser | null>(null);
  const onSearchDebounced = useDebouncedCallback(setSearch, 150);

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

  const list = useUserCoursesList({
    page: 1,
    pageSize: 500,
    sorts: [],
    q: "",
    expand: ["user"],
    student_roster_order: true,
    filterParams,
  });

  const canEdit = Boolean(
    user &&
      courseRosterStewardEnabled(user, {
        teacherMemberIds,
        createdById: getCreatedByIdFromCourse(course),
      }),
  );

  const students = useMemo(() => {
    return list.rows
      .map(userFromRow)
      .filter((row): row is ProfileRosterUser => Boolean(row));
  }, [list.rows]);

  const filtered = useMemo(
    () => students.filter((row) => matchesCourseProfileSearch(row, search)),
    [students, search],
  );

  const showEmpty = !list.isLoading && filtered.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="relative w-full max-w-xs">
        <Search
          width={15}
          height={15}
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <Input
          aria-label="Search students"
          placeholder="Search name or email…"
          defaultValue={search}
          className="h-8 pl-8"
          onChange={(event) => onSearchDebounced(event.target.value)}
        />
      </div>

      {list.isError ? (
        <p className="text-sm text-danger" role="alert">
          {parseSchedjuiceApiError(list.error, "Could not load students.")}
        </p>
      ) : null}

      {showEmpty ? (
        <EmptyState>
          {search.trim() ? (
            <EmptyCopy {...EMPTY_COPY_PRESETS.noMatchBase} />
          ) : (
            <EmptyCopy
              enBefore="No "
              enHighlight="students"
              enAfter=""
              myBefore="ကျောင်းသား "
              myHighlight="မရှိ"
              myAfter="ပါ"
            />
          )}
        </EmptyState>
      ) : (
        <div className={courseOperationalTableShellClassName()}>
          <table className={courseOperationalTableClassName()}>
            <thead>
              <tr className={courseOperationalTableHeadRowClassName()}>
                <th className={courseOperationalTableHeadCellClassName()}>
                  Full name
                </th>
                <th className={courseOperationalTableHeadCellClassName()}>
                  Alternative name
                </th>
                <th className={courseOperationalTableHeadCellClassName()}>
                  Phone
                </th>
                <th className={courseOperationalTableHeadCellClassName()}>
                  Communication email
                </th>
                <th className={courseOperationalTableHeadCellClassName()}>
                  History
                </th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading
                ? [0, 1, 2, 3].map((row) => (
                    <tr key={row} className="border-b border-border-subtle">
                      <td
                        className={courseOperationalTableBodyCellClassName()}
                        colSpan={5}
                      >
                        <div
                          className="h-9 w-full max-w-md rounded-md bg-surface-hover"
                          aria-hidden
                        />
                      </td>
                    </tr>
                  ))
                : filtered.map((student) => (
                    <tr
                      key={student.id}
                      className="h-[52px] border-b border-border-subtle last:border-b-0"
                    >
                      <td className={courseOperationalTableBodyCellClassName()}>
                        <StewardTextCell
                          userId={student.id}
                          field="name"
                          value={student.name}
                          canEdit={canEdit}
                          required
                        />
                      </td>
                      <td className={courseOperationalTableBodyCellClassName()}>
                        <StewardTextCell
                          userId={student.id}
                          field="alternative_name"
                          value={student.alternative_name}
                          canEdit={canEdit}
                        />
                      </td>
                      <td className={courseOperationalTableBodyCellClassName()}>
                        <StewardTextCell
                          userId={student.id}
                          field="phone_number"
                          value={student.phone_number}
                          canEdit={canEdit}
                        />
                      </td>
                      <td className={courseOperationalTableBodyCellClassName()}>
                        <StewardTextCell
                          userId={student.id}
                          field="communication_email"
                          value={student.communication_email}
                          canEdit={canEdit}
                        />
                      </td>
                      <td className={courseOperationalTableBodyCellClassName()}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryStudent(student)}
                        >
                          History
                        </Button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {historyStudent ? (
        <UserFieldHistorySheet
          userId={historyStudent.id}
          subjectName={historyStudent.name ?? "this person"}
          open
          onOpenChange={(open) => {
            if (!open) setHistoryStudent(null);
          }}
        />
      ) : null}
    </div>
  );
}
