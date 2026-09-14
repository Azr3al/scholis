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
import {
  formatDate,
  formatSessionClock,
  getFirstDayOfMonth,
  getLastDayOfMonth,
  getDateISOString,
} from "@/helpers/date";
import {
  getDateOnly,
  utcDateTimeToTenantHHmm,
} from "@/helpers/checkin-history";
import { buildCheckinHistoryRowPayload } from "@/helpers/checkin-history-row-autosave";
import { permissionsFor } from "@/helpers/authorization";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { usePendingEdits } from "@/hooks/usePendingEdits";
import { useCheckinHistoryRowAutosave } from "@/hooks/useCheckinHistoryRowAutosave";
import { operatorEnum } from "@/types/api";
import { role } from "@/types/user";
import { parseAsString, useQueryState } from "nuqs";
import { queryClient } from "@/lib/query";
import { fetchEntity, searchEntities, updateEntity } from "@/app/client-api/utils";
import { listToApiArray } from "@/helpers/filter-params";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, buttonVariants, Input, Switch } from "@/components/primitives";
import { useCallback, useMemo, useState, Suspense } from "react";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { Edit } from "iconoir-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import FullScreenImageViewer from "@/components/images/full-screen-image-viewer";
import { FormSaveTick } from "@/components/product-docs/form-save-tick";
import type { ResolvedRowTimes } from "@/helpers/checkin-history-row-autosave";
import { useUserEventsList } from "@/sdk/hooks/user-events";
import type { UserEvent } from "@/sdk/_types/user-events";
import { resolveTimeDisplayFormat, formatOrgTime } from "@/helpers/time-format";

const ACTIVITIES_TRUNCATE = 80;

type PendingEdit = {
  eventDate?: string;
  checkin_time?: string | null;
  checkout_time?: string | null;
  hourly_rate_at_calculation?: string;
  student_count?: string;
};

function getEffectiveRowTimes(
  row: {
    checkin_time?: string | null;
    checkout_time?: string | null;
  },
  pending: Partial<PendingEdit> | undefined,
  tenantTimezone?: string,
): ResolvedRowTimes {
  const serverCheckin =
    utcDateTimeToTenantHHmm(row.checkin_time, tenantTimezone) ?? "";
  const serverCheckout =
    utcDateTimeToTenantHHmm(row.checkout_time, tenantTimezone) ?? "";
  return {
    checkin:
      pending?.checkin_time !== undefined
        ? (pending.checkin_time ?? "")
        : serverCheckin,
    checkout:
      pending?.checkout_time !== undefined
        ? (pending.checkout_time ?? "")
        : serverCheckout,
  };
}

const CheckinHistoriesPage = () => {
  const { tenant } = useTenant();
  const { user } = useUser();
  const canManageStudentCount = Boolean(
    user && permissionsFor(user).can("attendance.manage_all"),
  );
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const [isEditMode, setIsEditMode] = useState(false);
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
  const { pendingEdits, setPending, clearPending } =
    usePendingEdits<PendingEdit>();

  const rowAutosave = useCheckinHistoryRowAutosave({
    pendingEdits,
    tenantTimezone: tenant?.timezone,
    enabled: isEditMode,
    onSaveSuccess: () => {
      clearPending();
      setIsEditMode(false);
    },
  });

  const saveMutation = useMutation({
    mutationKey: ["saveFinanceCheckinEdits"],
    mutationFn: async () => {
      const entries = Object.entries(pendingEdits);
      for (const [idStr, edit] of entries) {
        if (!idStr) continue;

        const payload = buildCheckinHistoryRowPayload(edit, tenant?.timezone);
        if (Object.keys(payload).length === 0) continue;

        await updateEntity("user-events", idStr, payload);
      }

      queryClient.invalidateQueries({ queryKey: ["user-events"] });
    },
    onSuccess: () => {
      clearPending();
      setIsEditMode(false);
    },
  });

  const isSaving = saveMutation.isPending || rowAutosave.isSaving;

  const [selectedUser, setSelectedUser] = useQueryState(
    "userId",
    parseAsString.withDefault("")
  );
  const [selectedCourse, setSelectedCourse] = useQueryState(
    "courseId",
    parseAsString.withDefault("")
  );

  const [date, setDate] = useQueryState("date", {
    defaultValue: new Date(),
    parse: (d) => new Date(d),
  });
  const [includeInactiveUsers, setIncludeInactiveUsers] = useState(false);

  const selectedUserQuery = useQuery({
    queryKey: ["checkin-hist-selected-user", selectedUser],
    queryFn: () => fetchEntity("users", selectedUser, ["id", "name", "email"]),
    enabled: !!selectedUser,
  });

  const selectedUserRecord = selectedUserQuery.data?.data?.data as
    | { id: number; name: string; email?: string }
    | undefined;

  const selectedUserLabel = selectedUserRecord?.name
    ? selectedUserRecord.name
    : "Search teacher by name, alt name, or email";

  const fetchUserOptions = useCallback(
    async (searchValue: string) => {
      const q = searchValue.trim();
      if (q.length < 2) return [];
      const res = await searchEntities(
        "users",
        {
          size: 20,
          fields: ["id", "name", "email", "alternative_name"],
          sorts: ["name"],
          q,
          ...(includeInactiveUsers ? { include_inactive: true } : {}),
        },
        {
          filter_params: [
            {
              field_name: "roles",
              operator: operatorEnum.contains,
              value: listToApiArray([role.teacher]),
            },
          ],
        },
      );
      const rows = (res.data?.data ?? []) as {
        id: number;
        name: string;
        email?: string;
        alternative_name?: string | null;
      }[];
      return rows.map((u) => ({
        value: String(u.id),
        label: [u.name, u.alternative_name, u.email].filter(Boolean).join(" · "),
      }));
    },
    [includeInactiveUsers],
  );

  const filterParams = useMemo(() => {
    const params: {
      field_name: string;
      operator: typeof operatorEnum.exact | typeof operatorEnum.gte | typeof operatorEnum.lte;
      value: string;
    }[] = [];

    if (selectedUser) {
      params.push({
        field_name: "user_id",
        operator: operatorEnum.exact,
        value: String(selectedUser),
      });
    }
    if (selectedCourse) {
      params.push({
        field_name: "event__course_id",
        operator: operatorEnum.exact,
        value: String(selectedCourse),
      });
    }

    const firstDay = getFirstDayOfMonth(date);
    const lastDay = getLastDayOfMonth(date);
    params.push({
      field_name: "event__date",
      operator: operatorEnum.gte,
      value: getDateISOString(firstDay),
    });
    params.push({
      field_name: "event__date",
      operator: operatorEnum.lte,
      value: getDateISOString(lastDay),
    });

    return params;
  }, [selectedUser, selectedCourse, date]);

  const tableState = useResourceTableState({
    namespace: "checkin-histories",
    syncUrl: false,
    initial: { sorts: ["-event__date"] },
  });

  const list = useUserEventsList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts.length ? tableState.sorts : ["-event__date"],
    q: tableState.q,
    expand: ["event.course", "user"],
    filterParams,
  });

  const columns: Column<UserEvent>[] = useMemo(
    () => [
      column.text<UserEvent>({
        id: "event__date",
        header: "Date",
        accessor: (r) => (r.event?.date ? formatDate(r.event.date) : null),
        enableSorting: true,
        sizing: { role: "date", width: { min: "9rem" } },
      }),
      column.text<UserEvent>({
        id: "event__course__title",
        header: "Course",
        accessor: (r) => r.event?.course?.title,
        enableSorting: true,
      }),
      {
        id: "event__time_from",
        header: "Session time",
        accessor: (r) => {
          const from = r.event?.time_from;
          const to = r.event?.time_to;
          if (!from || !to) return "N/A";
          return `${formatSessionClock(from, timeFormat)}–${formatSessionClock(to, timeFormat)}`;
        },
        enableSorting: false,
        sizing: { role: "date", width: { min: "9rem" } },
        cell: ({ value }) => <span>{String(value ?? "N/A")}</span>,
      },
      {
        id: "checkin_time",
        header: "Checkin Time",
        accessor: (r) => r.checkin_time,
        enableSorting: false,
        sizing: { role: "date", width: { min: "9rem" } },
        cell: ({ row }) => {
          const v = utcDateTimeToTenantHHmm(row.checkin_time, tenant?.timezone);
          if (!isEditMode) {
            return <span>{v ? formatOrgTime(v, timeFormat) : "N/A"}</span>;
          }
          const rowId = String(row.id);
          const pending = pendingEdits[rowId];
          const pendingCheckin = pending?.checkin_time;
          const value = pendingCheckin !== undefined ? pendingCheckin : v;
          const eventDate = getDateOnly(row.event?.date) ?? undefined;
          const effectiveTimes = getEffectiveRowTimes(
            row,
            pending,
            tenant?.timezone,
          );
          return (
            <InlineTimeSelect
              confirmToClose
              value={value}
              isDisabled={isSaving}
              onChange={(time) =>
                setPending(row.id, {
                  eventDate,
                  checkin_time: time,
                })
              }
              onOpenChange={(open, currentValue) =>
                rowAutosave.onPickerOpenChange(
                  row.id,
                  effectiveTimes,
                  "checkin",
                  currentValue,
                  open,
                )
              }
            />
          );
        },
      },
      {
        id: "checkout_time",
        header: "Checkout Time",
        accessor: (r) => r.checkout_time,
        enableSorting: false,
        sizing: { role: "date", width: { min: "9rem" } },
        cell: ({ row }) => {
          const v = utcDateTimeToTenantHHmm(
            row.checkout_time,
            tenant?.timezone,
          );
          if (!isEditMode) {
            return <span>{v ? formatOrgTime(v, timeFormat) : "N/A"}</span>;
          }
          const rowId = String(row.id);
          const pending = pendingEdits[rowId];
          const pendingCheckout = pending?.checkout_time;
          const value = pendingCheckout !== undefined ? pendingCheckout : v;
          const eventDate = getDateOnly(row.event?.date) ?? undefined;
          const effectiveTimes = getEffectiveRowTimes(
            row,
            pending,
            tenant?.timezone,
          );
          return (
            <InlineTimeSelect
              confirmToClose
              value={value}
              isDisabled={isSaving}
              onChange={(time) =>
                setPending(row.id, {
                  eventDate,
                  checkout_time: time,
                })
              }
              onOpenChange={(open, currentValue) =>
                rowAutosave.onPickerOpenChange(
                  row.id,
                  effectiveTimes,
                  "checkout",
                  currentValue,
                  open,
                )
              }
            />
          );
        },
      },
      {
        id: "today_activities",
        header: "Today's activities",
        accessor: (r) => r.today_activities ?? "",
        enableSorting: false,
        cell: ({ row }) => {
          const text = row.today_activities;
          if (!text) {
            return <span className="text-text-muted">—</span>;
          }
          const display =
            text.length > ACTIVITIES_TRUNCATE
              ? `${text.slice(0, ACTIVITIES_TRUNCATE)}…`
              : text;
          return (
            <span title={text} className="block max-w-xs truncate">
              {display}
            </span>
          );
        },
      },
      {
        id: "checkin_image",
        header: "Screenshot",
        accessor: (r) => r.checkin_image,
        enableSorting: false,
        cell: ({ row }) => {
          if (!row.checkin_image) {
            return <span className="text-text-muted">—</span>;
          }
          return (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setViewImageUrl(row.checkin_image || null)}
            >
              View
            </Button>
          );
        },
      },
      column.text<UserEvent>({
        id: "hourly_rate_at_calculation",
        header: "Hourly Rate",
        accessor: (r) =>
          r.hourly_rate_at_calculation != null
            ? String(r.hourly_rate_at_calculation)
            : null,
        enableSorting: false,
      }),
      column.text<UserEvent>({
        id: "student_bonus_rate_at_calculation",
        header: "Student Bonus Rate",
        accessor: (r) =>
          r.student_bonus_rate_at_calculation != null
            ? String(r.student_bonus_rate_at_calculation)
            : null,
        enableSorting: false,
      }),
      {
        id: "student_count_in_course_at_calculation",
        header: "Students",
        accessor: (r) =>
          r.student_count_in_course_at_calculation != null
            ? String(r.student_count_in_course_at_calculation)
            : null,
        enableSorting: false,
        cell: ({ row }) => {
          const serverValue =
            row.student_count_in_course_at_calculation != null
              ? String(row.student_count_in_course_at_calculation)
              : "";
          if (!isEditMode || !canManageStudentCount) {
            return (
              <span>{serverValue !== "" ? serverValue : "—"}</span>
            );
          }
          const rowId = String(row.id);
          const pending = pendingEdits[rowId];
          const value =
            pending?.student_count !== undefined
              ? pending.student_count
              : serverValue;
          const eventDate = getDateOnly(row.event?.date) ?? undefined;
          return (
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              className="h-8 w-20"
              value={value}
              disabled={isSaving}
              onChange={(event) =>
                setPending(row.id, {
                  eventDate,
                  student_count: event.target.value,
                })
              }
            />
          );
        },
      },
    ],
    [
      canManageStudentCount,
      isEditMode,
      isSaving,
      pendingEdits,
      rowAutosave,
      setPending,
      tenant?.timezone,
      timeFormat,
    ],
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link
          href={"/finances/rates"}
          className={cn(buttonVariants({ variant: "ghost"  }), "space-x-2")}
        >
          <Edit></Edit>
          <span>Edit Hourly Rates</span>
        </Link>
      </div>

      <fieldset
        disabled={isSaving}
        className="flex flex-wrap items-end justify-between gap-3 border-0 p-0 m-0 min-w-0"
      >
        <FilterToolbar>
          <EntityCombobox
            label={selectedUserLabel}
            value={selectedUser || undefined}
            onChange={setSelectedUser}
            fetchOptions={fetchUserOptions}
            debounceMilliseconds={300}
            widthClassName="w-full min-w-56"
          />
          <label
            htmlFor="checkin-hist-include-inactive"
            className="flex items-center gap-2 self-end pb-2"
          >
            <Switch
              id="checkin-hist-include-inactive"
              checked={includeInactiveUsers}
              onCheckedChange={setIncludeInactiveUsers}
            />
            <span className="whitespace-nowrap text-sm font-normal text-text-primary">
              Include inactive
            </span>
          </label>
          <EntityCombobox
            entity="courses"
            value={selectedCourse || undefined}
            onChange={setSelectedCourse}
            label="Filter Course"
            layout="toolbar"
            containerClassName="min-w-[200px]"
            displayFunction={(c) => c.title}
            queryParams={{ fields: ["id", "title"], sorts: ["title"] }}
          />
          <YearMonthSelector
            layout="toolbar"
            label="Filter By Month"
            date={date}
            setDate={setDate}
          />
        </FilterToolbar>
        <Button
          variant="secondary"
          type="button"
          onClick={() => {
            setSelectedUser(null);
            setSelectedCourse(null);
            setDate(null);
          }}
        >
          Clear
        </Button>
      </fieldset>
      <div className="flex items-center justify-end gap-2">
        <DataTableEditControls
          isEditMode={isEditMode}
          isLoading={isSaving}
          onEdit={() => setIsEditMode(true)}
          onDone={() => saveMutation.mutate()}
          onCancel={() => {
            rowAutosave.cancelAll();
            setIsEditMode(false);
            clearPending();
          }}
          editIcon={<Edit className="mr-2 h-4 w-4" />}
          doneIcon={<Edit className="mr-2 h-4 w-4" />}
        />
        <FormSaveTick visible={rowAutosave.showSavedTick} />
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
      <FullScreenImageViewer
        imageUrl={viewImageUrl}
        title="Screenshot"
        onClose={() => setViewImageUrl(null)}
      />
    </div>
  );
};

const CheckinHistorySuspence = () => {
  return (
    <PageContainer width="wide">
      <Suspense>
        <CheckinHistoriesPage></CheckinHistoriesPage>
      </Suspense>
    </PageContainer>
  );
};

export default CheckinHistorySuspence;
