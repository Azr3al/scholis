"use client";

import { PageContainer } from "@/components/layout/page-container";
import EntityCombobox from "@/components/form/entity-combobox";
import { FilterToolbar } from "@/components/filters/filter-toolbar";
import InlineTimeSelect from "@/components/datatable/inline-time-select";
import DataTableEditControls from "@/app/_chrome/checkin-controls";
import {
  ResourceTable,
  column,
  useResourceTableState,
  type Column,
} from "@/components/data-table";
import { Button, buttonVariants, Switch } from "@/components/primitives";
import { queryParamDefault } from "@/config/defaults";
import { formatDate } from "@/helpers/date";
import {
  getDateOnly,
  tenantHHmmToUtcDateTime,
  utcDateTimeToTenantHHmm,
} from "@/helpers/checkin-history";
import { listToApiArray } from "@/helpers/filter-params";
import { formatMoney } from "@/helpers/money";
import { usePendingEdits } from "@/hooks/usePendingEdits";
import { useTenant } from "@/hooks/useTenant";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import { queryClient } from "@/lib/query";
import { updateEntity } from "@/app/client-api/utils";
import { useUserAttendancesList } from "@/sdk/hooks/user-attendances";
import type { UserAttendance } from "@/sdk/_types/user-attendances";
import { useMutation } from "@tanstack/react-query";
import { Edit } from "iconoir-react";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo, useState, Suspense } from "react";
import { cn } from "@/lib/utils";

type PendingEdit = {
  join_time?: string | null;
  leave_time?: string | null;
  join_date?: string | null;
  leave_date?: string | null;
};

const formatDuration = (seconds: number) => {
  const totalMins = Math.round(seconds / 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const UserAttendancePage = () => {
  const { tenant } = useTenant();
  const currencySymbol = useTenantCurrencySymbol();
  const { user, isTeacher } = useUser();
  const [isEditMode, setIsEditMode] = useState(false);
  const { pendingEdits, setPending, clearPending } =
    usePendingEdits<PendingEdit>();
  const [includeInactiveUsers, setIncludeInactiveUsers] = useState(false);

  const saveMutation = useMutation({
    mutationKey: ["saveUserAttendanceEdits"],
    mutationFn: async () => {
      for (const [idStr, edit] of Object.entries(pendingEdits)) {
        if (!idStr) continue;
        const payload: Record<string, string | null> = {};
        if (edit.join_time !== undefined && edit.join_date) {
          payload.join_datetime = tenantHHmmToUtcDateTime(
            edit.join_date,
            edit.join_time,
            tenant?.timezone
          );
        }
        if (edit.leave_time !== undefined && edit.leave_date) {
          payload.leave_datetime = tenantHHmmToUtcDateTime(
            edit.leave_date,
            edit.leave_time,
            tenant?.timezone
          );
        }
        if (Object.keys(payload).length > 0) {
          await updateEntity("user-attendances", idStr, payload);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["user-attendances"] });
    },
    onSuccess: () => {
      clearPending();
      setIsEditMode(false);
    },
  });

  const isSaving = saveMutation.isPending;

  const [courseId, setCourseId] = useQueryState(
    "courseId",
    parseAsString.withDefault("")
  );
  const [userId, setUserId] = useQueryState(
    "userId",
    parseAsString.withDefault("")
  );

  useEffect(() => {
    if (isTeacher && user?.id && !userId) setUserId(String(user.id));
  }, [isTeacher, user?.id, userId, setUserId]);

  const filterParams = useMemo(() => {
    const params: {
      field_name: string;
      operator: typeof operatorEnum.exact;
      value: string;
    }[] = [];
    if (courseId) {
      params.push({
        field_name: "course",
        operator: operatorEnum.exact,
        value: courseId,
      });
    }
    return params;
  }, [courseId]);

  const tableState = useResourceTableState({
    namespace: "user-attendance",
    syncUrl: false,
    initial: { sorts: ["-join_datetime"] },
  });

  const list = useUserAttendancesList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts.length ? tableState.sorts : ["-join_datetime"],
    q: tableState.q,
    expand: ["user", "course"],
    filterParams,
    enabled: !!userId,
  });

  const columns: Column<UserAttendance>[] = useMemo(
    () => [
      column.text<UserAttendance>({
        id: "user__name",
        header: "User",
        accessor: (r) => r.user?.name,
        enableSorting: false,
      }),
      column.text<UserAttendance>({
        id: "course__title",
        header: "Course",
        accessor: (r) => r.course?.title,
        enableSorting: false,
      }),
      {
        id: "attendance_date",
        header: "Attendance Date",
        accessor: (r) => r.attendance_date,
        enableSorting: false,
        sizing: { role: "date", width: { min: "9rem" } },
        cell: ({ row }) => (
          <span>
            {row.attendance_date ? formatDate(row.attendance_date) : "—"}
          </span>
        ),
      },
      {
        id: "join_datetime",
        header: "Join",
        accessor: (r) => r.join_datetime,
        enableSorting: false,
        sizing: { role: "date", width: { min: "9rem" } },
        cell: ({ row }) => {
          const v = utcDateTimeToTenantHHmm(
            row.join_datetime,
            tenant?.timezone
          );
          if (!isEditMode) return <span>{v || "—"}</span>;
          const pending = pendingEdits[String(row.id)]?.join_time;
          const value = pending !== undefined ? pending : v;
          const joinDate = getDateOnly(row.join_datetime);
          return (
            <InlineTimeSelect
              value={value}
              isDisabled={isSaving}
              onChange={(time) =>
                setPending(row.id, {
                  join_time: time,
                  join_date: joinDate ?? undefined,
                })
              }
            />
          );
        },
      },
      {
        id: "leave_datetime",
        header: "Leave",
        accessor: (r) => r.leave_datetime,
        enableSorting: false,
        sizing: { role: "date", width: { min: "9rem" } },
        cell: ({ row }) => {
          const v = utcDateTimeToTenantHHmm(
            row.leave_datetime,
            tenant?.timezone
          );
          if (!isEditMode) return <span>{v || "—"}</span>;
          const pending = pendingEdits[String(row.id)]?.leave_time;
          const value = pending !== undefined ? pending : v;
          const leaveDate =
            getDateOnly(row.leave_datetime) ?? getDateOnly(row.join_datetime);
          return (
            <InlineTimeSelect
              value={value}
              isDisabled={isSaving}
              onChange={(time) =>
                setPending(row.id, {
                  leave_time: time,
                  leave_date: leaveDate ?? undefined,
                })
              }
            />
          );
        },
      },
      {
        id: "duration",
        header: "Duration",
        accessor: (r) => {
          const join = r.join_datetime;
          const leave = r.leave_datetime;
          if (!join || !leave) return null;
          const secs =
            (new Date(leave).getTime() - new Date(join).getTime()) / 1000;
          return formatDuration(secs);
        },
        enableSorting: false,
        cell: ({ value }) => <span>{value == null ? "—" : String(value)}</span>,
      },
      {
        id: "hourly_rate_at_creation",
        header: "Hourly Rate",
        accessor: (r) => r.hourly_rate_at_creation,
        enableSorting: false,
        sizing: { role: "numeric", tabular: true },
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {row.hourly_rate_at_creation != null
              ? formatMoney(row.hourly_rate_at_creation, currencySymbol)
              : "—"}
          </span>
        ),
      },
      {
        id: "earnings",
        header: "Earnings",
        accessor: (r) => {
          const rate = r.hourly_rate_at_creation;
          const join = r.join_datetime;
          const leave = r.leave_datetime;
          if (rate == null || !join || !leave) return null;
          const secs =
            (new Date(leave).getTime() - new Date(join).getTime()) / 1000;
          return (secs / 3600) * Number(rate);
        },
        enableSorting: false,
        sizing: { role: "numeric", tabular: true },
        cell: ({ value }) => (
          <span className="block text-right tabular-nums">
            {value == null ? "—" : formatMoney(Number(value), currencySymbol)}
          </span>
        ),
      },
    ],
    [
      currencySymbol,
      isEditMode,
      isSaving,
      pendingEdits,
      setPending,
      tenant?.timezone,
    ],
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link
          href="/finances/rates"
          className={cn(buttonVariants({ variant: "ghost"  }), "space-x-2")}
        >
          <Edit className="mr-2 h-4 w-4" />
          Edit Hourly Rates
        </Link>
      </div>
      <fieldset
        disabled={isSaving}
        className="flex flex-wrap items-end justify-between gap-3 border-0 p-0 m-0 min-w-0"
      >
        <FilterToolbar>
          {!isTeacher && (
            <>
              <EntityCombobox
                entity="users"
                value={userId || undefined}
                onChange={setUserId}
                label="User"
                layout="toolbar"
                containerClassName="min-w-[200px]"
                displayFunction={(u) => u.name}
                disabled={isSaving}
                queryParams={{
                  ...queryParamDefault,
                  fields: ["id", "name"],
                  sorts: ["name"],
                  ...(includeInactiveUsers ? { include_inactive: true } : {}),
                }}
                filterParams={{
                  filter_params: [
                    {
                      field_name: "roles",
                      operator: operatorEnum.contains,
                      value: listToApiArray(["teacher"]),
                    },
                  ],
                }}
                canSetDefaultValue
              />
              <label
                htmlFor="user-attendance-include-inactive"
                className="flex items-center gap-2 self-end pb-2"
              >
                <Switch
                  id="user-attendance-include-inactive"
                  checked={includeInactiveUsers}
                  onCheckedChange={setIncludeInactiveUsers}
                />
                <span className="whitespace-nowrap text-sm font-normal text-text-primary">
                  Include inactive
                </span>
              </label>
            </>
          )}
          <EntityCombobox
            entity="courses"
            value={courseId || undefined}
            onChange={setCourseId}
            label="Filter by Course (optional)"
            layout="toolbar"
            containerClassName="min-w-[200px]"
            displayFunction={(c) => c.title}
            disabled={isSaving}
            queryParams={{ fields: ["id", "title"], sorts: ["title"] }}
          />
        </FilterToolbar>
        <Button
          variant="secondary"
          type="button"
          onClick={() => setCourseId("")}
          disabled={!courseId || isSaving}
        >
          Clear course
        </Button>
      </fieldset>
      <div className="flex justify-end">
        <DataTableEditControls
          isEditMode={isEditMode}
          isLoading={isSaving}
          onEdit={() => setIsEditMode(true)}
          onDone={() => saveMutation.mutate()}
          onCancel={() => {
            setIsEditMode(false);
            clearPending();
          }}
          editIcon={<Edit className="mr-2 h-4 w-4" />}
          doneIcon={<Edit className="mr-2 h-4 w-4" />}
        />
      </div>
      <div
        className="min-w-0 overflow-x-auto"
        aria-busy={isSaving || undefined}
      >
        <ResourceTable
          list={list}
          tableState={tableState}
          columns={columns}
          getRowId={(row) => String(row.id)}
        />
      </div>
    </div>
  );
};

const UserAttendanceSuspense = () => (
  <PageContainer width="wide">
    <Suspense>
      <UserAttendancePage />
    </Suspense>
  </PageContainer>
);

export default UserAttendanceSuspense;
