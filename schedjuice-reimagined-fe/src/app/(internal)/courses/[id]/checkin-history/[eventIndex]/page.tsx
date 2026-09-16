"use client";

import { PageContainer } from "@/components/layout/page-container";
import BackButton from "@/components/misc/back-button";
import { Button, Select, Separator } from "@/components/primitives";
import DataTableEditControls from "@/components/attendance/checkin-controls";
import { usePendingEdits } from "@/hooks/usePendingEdits";
import { tenantHHmmToUtcDateTime, utcDateTimeToTenantHHmm } from "@/helpers/checkin-history";
import { resolveEventYmd } from "@/helpers/attendance-marking";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/courses/ui/url-tabs";
import {
  ResourceTable,
  useResourceTableState,
  type Column,
} from "@/components/data-table";
import Selector from "@/components/form/selectors/selector";
import { Loader } from "@/components/form/loader";
import { searchEntities, updateEntity } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";
import { eventType } from "@/types/course";
import { formatDate, formatSessionClock } from "@/helpers/date";
import { getTimezoneOffset } from "@/helpers/timeslot";
import { useTenant } from "@/hooks/useTenant";
import { ArrowLeft, ArrowRight, ArrowRightCircle, Edit } from "iconoir-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useCallback, useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/query";
import { useToast } from "@/components/primitives";
import moment from "moment";
import FullScreenImageViewer from "@/components/images/full-screen-image-viewer";
import InlineTimeSelect from "@/components/datatable/inline-time-select";
import { hasAdminCredentials, permissionsFor } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import {
  bootstrapCheckinHistoryRows,
  patchSelfCheckinCorrection,
} from "@/app/client-api/attendance-self-correction";
import { AttendanceCorrectionHistorySheet } from "@/components/attendance/attendance-correction-history-sheet";
import { TeacherCheckinCorrectionDialog } from "@/components/attendance/teacher-checkin-correction-dialog";
import type { accountType } from "@/types/user";
import { CheckinCorrectionTodayActivitiesField } from "@/components/attendance/checkin-correction-today-activities-field";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { useAttendancesList } from "@/sdk/hooks/attendances";
import type { Attendance } from "@/sdk/_types/attendances";
import { resolveTimeDisplayFormat } from "@/helpers/time-format";

function displayEventTitle(title?: string | null) {
  const trimmed = title?.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—") return "";
  return trimmed;
}

type TeacherPendingEdit = {
  checkinHHmm?: string;
  checkoutHHmm?: string;
  eventDate?: string;
  checkinImage?: File;
  todayActivities?: string;
};

function teacherPendingHasChanges(
  row: Attendance,
  edit: TeacherPendingEdit | undefined,
  formatAttendanceTenantTime: (utcDateTime?: string | null) => string,
) {
  if (!edit) return false;
  if (edit.checkinImage) return true;
  if (
    edit.checkinHHmm !== undefined &&
    edit.checkinHHmm !== formatAttendanceTenantTime(row.checkin_time)
  ) {
    return true;
  }
  if (
    edit.checkoutHHmm !== undefined &&
    edit.checkoutHHmm !== formatAttendanceTenantTime(row.checkout_time)
  ) {
    return true;
  }
  if (
    edit.todayActivities !== undefined &&
    edit.todayActivities.trim() !== (row.today_activities ?? "").trim()
  ) {
    return true;
  }
  return false;
}

function isCheckinTimeChanging(
  row: Attendance,
  edit: TeacherPendingEdit | undefined,
  formatAttendanceTenantTime: (utcDateTime?: string | null) => string,
) {
  if (!edit?.checkinHHmm) return false;
  return edit.checkinHHmm !== formatAttendanceTenantTime(row.checkin_time);
}

function correctionMissingRequiredScreenshot(
  row: Attendance,
  edit: TeacherPendingEdit | undefined,
  formatAttendanceTenantTime: (utcDateTime?: string | null) => string,
) {
  return (
    isCheckinTimeChanging(row, edit, formatAttendanceTenantTime) &&
    !edit?.checkinImage
  );
}

function canCorrectTeacherRow(
  row: Attendance,
  options: {
    canAdminCorrectTeachers: boolean;
    canTeacherSelfEdit: boolean;
    userId?: number;
  },
) {
  if (options.canAdminCorrectTeachers) return true;
  return (
    options.canTeacherSelfEdit &&
    row.user?.id !== undefined &&
    row.user.id === options.userId
  );
}

function canViewAttendanceCorrections(row: Attendance, user: accountType) {
  if (row.user?.id === user.id) return true;
  const perms = permissionsFor(user);
  return perms.can("attendance.manage_all") || perms.can("checkin.view_all");
}

export default function CheckinHistoryPage() {
  const { eventIndex: rawEventIndex, id } = useParams<{
    id: string;
    eventIndex?: string;
  }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const { user, isTeacher } = useUser();
  const toast = useToast();
  const [isEditMode, setIsEditMode] = useState(false);
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [correctionSheet, setCorrectionSheet] = useState<{
    attendanceId: number;
    teacherName: string;
    sessionLabel?: string;
  } | null>(null);
  const [teacherPending, setTeacherPending] = useState<
    Record<
      string,
      {
        checkinHHmm?: string;
        checkoutHHmm?: string;
        eventDate?: string;
        checkinImage?: File;
        todayActivities?: string;
      }
    >
  >({});

  const handleTodayActivitiesChange = useCallback(
    (rowKey: string, value: string) => {
      setTeacherPending((prev) => ({
        ...prev,
        [rowKey]: {
          ...prev[rowKey],
          todayActivities: value,
        },
      }));
    },
    [],
  );

  const teacherPendingRef = useRef(teacherPending);
  teacherPendingRef.current = teacherPending;

  const canAdminEdit = Boolean(user && hasAdminCredentials(user));
  const canAdminCorrectTeachers = Boolean(
    user &&
      canAdminEdit &&
      permissionsFor(user).can("attendance.manage_all") &&
      tenant?.allow_teacher_checkin_history_correction,
  );
  const canTeacherSelfEdit = Boolean(
    user &&
      isTeacher &&
      permissionsFor(user).can("attendance.correct_own_checkin") &&
      tenant?.allow_teacher_checkin_history_correction,
  );
  const canBootstrapCheckinHistory =
    canTeacherSelfEdit || canAdminCorrectTeachers;

  type PendingEdit = {
    is_extra_class?: boolean;
  };
  const { pendingEdits, setPending, clearPending } = usePendingEdits<PendingEdit>();
  const timezoneOffset = getTimezoneOffset(tenant?.timezone);
  const today = moment().format("YYYY-MM-DD");

  const dateOnly = (d?: string) => (d ? d.split("T")[0] : "");

  const formatDayLabel = useCallback((dayEvents: eventType[], dateKey: string) => {
    const datePart = moment(dateKey).format("DD-MM-YYYY (ddd)");
    if (dayEvents.length > 1) {
      return `${datePart} · ${dayEvents.length} sessions`;
    }
    const event = dayEvents[0];
    const timePart =
      event?.time_from && event?.time_to
        ? `${formatSessionClock(event.time_from, timeFormat)}–${formatSessionClock(event.time_to, timeFormat)}`
        : "";
    return timePart ? `${datePart} ${timePart}` : datePart;
  }, [timeFormat]);

  const formatEventSessionLabel = useCallback((event: NonNullable<Attendance["event"]>) => {
    const timePart =
      event.time_from && event.time_to
        ? `${formatSessionClock(event.time_from, timeFormat)}–${formatSessionClock(event.time_to, timeFormat)}`
        : "Time not set";
    const title = displayEventTitle(event.title);
    return title ? `${timePart} · ${title}` : timePart;
  }, [timeFormat]);

  const tenantTimezone = tenant?.timezone;

  const formatAttendanceTenantTime = useCallback(
    (utcDateTime?: string | null) =>
      utcDateTimeToTenantHHmm(utcDateTime, tenantTimezone) ?? "",
    [tenantTimezone],
  );

  const formatAttendanceTenantTimeDisplay = useCallback(
    (utcDateTime?: string | null) => {
      const hhmm = formatAttendanceTenantTime(utcDateTime);
      return hhmm ? formatSessionClock(hhmm, timeFormat) : "";
    },
    [formatAttendanceTenantTime, timeFormat],
  );

  const attendanceEventDate = useCallback(
    (event?: Attendance["event"] | null) =>
      event ? resolveEventYmd(event, tenantTimezone ?? "UTC") : "",
    [tenantTimezone],
  );

  const { data: eventResponse, isLoading: eventsLoading } = useQuery({
    queryKey: ["searchEvents", id],
    queryFn: () =>
      searchEntities(
        "events",
        { size: -1, sorts: ["date"] },
        {
          filter_params: [
            {
              field_name: "course_id",
              operator: operatorEnum.exact,
              value: id,
            },
          ],
        }
      ),
  });

  const events: eventType[] = eventResponse?.data?.data || [];

  useEffect(() => {
    if (!events.length) return;

    const todayIdx = events.findIndex((e) => dateOnly(e.date) === today);
    const closestPastIdx = (() => {
      for (let i = events.length - 1; i >= 0; i--) {
        if (dateOnly(events[i].date) <= today) return i;
      }
      return -1;
    })();

    const preferredIndex =
      todayIdx !== -1
        ? todayIdx
        : closestPastIdx !== -1
        ? closestPastIdx
        : events.length - 1;

    const currentIndex = Number(rawEventIndex);
    const isValidIndex =
      !isNaN(currentIndex) && currentIndex >= 0 && currentIndex < events.length;

    if (!isValidIndex) {
      router.replace(`/courses/${id}/checkin-history/${preferredIndex}`);
    }
  }, [events, rawEventIndex, id, router, today]);

  const eventIndex = useMemo(() => {
    if (!events.length) return -1;
    const idx = Number(rawEventIndex);
    return idx >= 0 && idx < events.length ? idx : events.length - 1;
  }, [events.length, rawEventIndex]);

  const dayOptions = useMemo(() => {
    const byDate = new Map<
      string,
      { events: eventType[]; firstEventIndex: number }
    >();

    events.forEach((event, index) => {
      const dateKey = dateOnly(event.date);
      if (dateKey > today) return;

      const existing = byDate.get(dateKey);
      if (existing) {
        existing.events.push(event);
        return;
      }
      byDate.set(dateKey, { events: [event], firstEventIndex: index });
    });

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, { events: dayEvents, firstEventIndex }]) => ({
        dateKey,
        events: dayEvents,
        eventIds: dayEvents.map((event) => event.id),
        firstEventIndex,
      }));
  }, [events, today]);

  const selectedDayIndex = useMemo(() => {
    if (eventIndex < 0 || !events[eventIndex]) return -1;
    const dateKey = dateOnly(events[eventIndex].date);
    return dayOptions.findIndex((day) => day.dateKey === dateKey);
  }, [dayOptions, events, eventIndex]);

  const selectedDay = selectedDayIndex >= 0 ? dayOptions[selectedDayIndex] : null;
  const selectedEventIds = selectedDay?.eventIds ?? [];
  const hasMultipleSessions = (selectedDay?.events.length ?? 0) > 1;

  const changeCurrentEvent = useCallback(
    (newIndex: number) => {
      router.push(`/courses/${id}/checkin-history/${newIndex}`);
    },
    [id, router]
  );

  const getTodayDayIndex = useCallback(() => {
    return dayOptions.findIndex((day) => day.dateKey === today);
  }, [dayOptions, today]);

  const changeCurrentDay = useCallback(
    (dayIndex: number) => {
      const day = dayOptions[dayIndex];
      if (!day) return;
      changeCurrentEvent(day.firstEventIndex);
    },
    [dayOptions, changeCurrentEvent]
  );

  const tab = searchParams.get("tab") || "teachers";

  const openCorrectionSheet = useCallback(
    (row: Attendance) => {
      setCorrectionSheet({
        attendanceId: row.id,
        teacherName: row.user?.name ?? "Teacher",
        sessionLabel: row.event ? formatEventSessionLabel(row.event) : undefined,
      });
    },
    [formatEventSessionLabel],
  );

  const closeCorrectionSheet = useCallback(() => {
    setCorrectionSheet(null);
  }, []);

  useEffect(() => {
    if (!canBootstrapCheckinHistory || !selectedEventIds.length || !id) return;
    bootstrapCheckinHistoryRows(id, selectedEventIds)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["attendances"] });
      })
      .catch(() => {});
  }, [canBootstrapCheckinHistory, id, selectedEventIds]);

  const saveMutation = useMutation({
    mutationKey: [
      "saveCheckinHistoryEdits",
      selectedEventIds.join(","),
      tab,
    ],
    mutationFn: async () => {
      const entries = Object.entries(pendingEdits);
      for (const [idStr, edit] of entries) {
        const attendanceId = Number(idStr);
        if (!attendanceId) continue;
        if (edit.is_extra_class === undefined) {
          continue;
        }
        await updateEntity("attendances", attendanceId, {
          is_extra_class: edit.is_extra_class,
        });
      }
    },
    onSuccess: () => {
      toast.add({ description: "Saved" });
      clearPending();
      queryClient.invalidateQueries({ queryKey: ["attendances"] });
      setIsEditMode(false);
    },
    onError: () => {
      toast.add({
        title: "Error",
        description: "Failed to save changes",
      });
    },
  });

  const teacherSaveMutation = useMutation({
    mutationKey: ["teacherCheckinCorrection", id, selectedEventIds.join(",")],
    mutationFn: async (reason: string) => {
      const teacherRows = teachersList.rows ?? [];
      const entries = Object.entries(teacherPending).filter(([rowKey, edit]) => {
        const row = teacherRows.find((item: Attendance) => String(item.id) === rowKey);
        if (!row) return false;
        return teacherPendingHasChanges(row, edit, formatAttendanceTenantTime);
      });
      for (const [idStr, edit] of entries) {
        const attendanceId = Number(idStr);
        if (!attendanceId) continue;
        const payload: {
          correction_reason: string;
          checkin_image?: File;
          checkin_time?: string;
          checkout_time?: string;
          today_activities?: string | null;
        } = {
          correction_reason: reason,
        };
        if (edit.checkinImage) {
          payload.checkin_image = edit.checkinImage;
        }
        if (edit.eventDate && edit.checkinHHmm) {
          const checkinTime = tenantHHmmToUtcDateTime(
            edit.eventDate,
            edit.checkinHHmm,
            tenant?.timezone,
          );
          if (checkinTime) payload.checkin_time = checkinTime;
        }
        if (edit.eventDate && edit.checkoutHHmm) {
          const checkoutTime = tenantHHmmToUtcDateTime(
            edit.eventDate,
            edit.checkoutHHmm,
            tenant?.timezone,
          );
          if (checkoutTime) payload.checkout_time = checkoutTime;
        }
        if (edit.todayActivities !== undefined) {
          payload.today_activities = edit.todayActivities;
        }
        await patchSelfCheckinCorrection(attendanceId, payload);
      }
    },
    onSuccess: async () => {
      const extraClassEntries = Object.entries(pendingEdits).filter(
        ([, edit]) => edit.is_extra_class !== undefined,
      );
      if (extraClassEntries.length > 0) {
        try {
          for (const [idStr, edit] of extraClassEntries) {
            const attendanceId = Number(idStr);
            if (!attendanceId) continue;
            await updateEntity("attendances", attendanceId, {
              is_extra_class: edit.is_extra_class,
            });
          }
          clearPending();
        } catch {
          toast.add({
            title: "Error",
            description: "Check-in saved, but extra class changes failed",
          });
        }
      }
      toast.add({ description: "Check-in changes saved" });
      setTeacherPending({});
      setReasonDialogOpen(false);
      setIsEditMode(false);
      queryClient.invalidateQueries({ queryKey: ["attendances"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-corrections"] });
    },
    onError: (error) => {
      toast.add({
        title: "Error",
        description: parseSchedjuiceApiError(
          error,
          "Failed to save check-in changes",
        ),
      });
    },
  });

  const showEditControls =
    tab === "teachers" &&
    (canAdminCorrectTeachers || canTeacherSelfEdit || canAdminEdit);

  const teacherRoleFilterValue = "{teacher}";
  const studentRoleFilterValue = "{student}";

  const teacherFilterParams = useMemo(
    () => [
      {
        field_name: "event_id",
        operator: operatorEnum.in,
        value: selectedEventIds.join(","),
      },
      {
        field_name: "user__roles",
        operator: operatorEnum.contains,
        value: teacherRoleFilterValue,
      },
    ],
    [selectedEventIds],
  );

  const studentFilterParams = useMemo(
    () => [
      {
        field_name: "event_id",
        operator: operatorEnum.in,
        value: selectedEventIds.join(","),
      },
      {
        field_name: "user__roles",
        operator: operatorEnum.contains,
        value: studentRoleFilterValue,
      },
    ],
    [selectedEventIds],
  );

  const teacherTableState = useResourceTableState({
    namespace: "checkin-history-teachers",
    syncUrl: false,
    initial: { sorts: ["event__time_from", "user__name"] },
  });

  const studentTableState = useResourceTableState({
    namespace: "checkin-history-students",
    syncUrl: false,
    initial: { sorts: ["event__time_from", "user__name"] },
  });

  useEffect(() => {
    teacherTableState.setState({ page: 1 });
    studentTableState.setState({ page: 1 });
    // Reset pagination when the selected day/session set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when event ids change
  }, [selectedEventIds.join(",")]);

  const teachersList = useAttendancesList({
    page: teacherTableState.page,
    pageSize: teacherTableState.pageSize,
    sorts: teacherTableState.sorts.length
      ? teacherTableState.sorts
      : ["event__time_from", "user__name"],
    q: teacherTableState.q,
    expand: ["user", "event"],
    filterParams: teacherFilterParams,
    enabled: selectedEventIds.length > 0,
  });

  const studentsList = useAttendancesList({
    page: studentTableState.page,
    pageSize: studentTableState.pageSize,
    sorts: studentTableState.sorts.length
      ? studentTableState.sorts
      : ["event__time_from", "user__name"],
    q: studentTableState.q,
    expand: ["user", "event"],
    filterParams: studentFilterParams,
    enabled: selectedEventIds.length > 0,
  });

  const columns: Column<Attendance>[] = useMemo(() => {
    const correctionOptions = {
      canAdminCorrectTeachers,
      canTeacherSelfEdit,
      userId: user?.id,
    };
    const cols: Column<Attendance>[] = [];

    if (hasMultipleSessions) {
      cols.push({
        id: "event.time_from",
        header: "Session",
        accessor: (row) =>
          row.event ? formatEventSessionLabel(row.event) : null,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm">
            {row.event ? formatEventSessionLabel(row.event) : "—"}
          </span>
        ),
      });
    }

    cols.push(
      {
        id: "user.name",
        header: "Name",
        accessor: (row) => row.user?.name,
        enableSorting: false,
        cell: ({ row }) => {
          const displayName = row.user?.name || "—";
          if (
            tab === "teachers" &&
            user &&
            canViewAttendanceCorrections(row, user)
          ) {
            return (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openCorrectionSheet(row);
                }}
                className="text-left font-medium text-primary hover:underline"
              >
                {displayName}
              </button>
            );
          }
          return <span className="font-medium">{displayName}</span>;
        },
      },
      {
        id: "checkin_time",
        header: "Check-in",
        accessor: (row) => row.checkin_time,
        enableSorting: false,
        cell: ({ row }) => {
          if (!isEditMode) {
            return (
              <span>
                {formatAttendanceTenantTimeDisplay(row.checkin_time) ||
                  formatAttendanceTenantTime(row.checkin_time)}
              </span>
            );
          }
          const eventDate = attendanceEventDate(row.event);
          const rowKey = String(row.id);
          const pending = teacherPendingRef.current[rowKey];
          const isCorrectableRow = canCorrectTeacherRow(row, correctionOptions);

          if (isCorrectableRow) {
            return (
              <InlineTimeSelect
                use12Hour
                value={
                  pending?.checkinHHmm ??
                  formatAttendanceTenantTime(row.checkin_time)
                }
                onChange={(v) =>
                  setTeacherPending((prev) => ({
                    ...prev,
                    [rowKey]: {
                      ...prev[rowKey],
                      checkinHHmm: v,
                      eventDate,
                    },
                  }))
                }
              />
            );
          }

          return (
            <span>
              {formatAttendanceTenantTimeDisplay(row.checkin_time) ||
                formatAttendanceTenantTime(row.checkin_time)}
            </span>
          );
        },
      },
      {
        id: "checkout_time",
        header: "Check-out",
        accessor: (row) => row.checkout_time,
        enableSorting: false,
        cell: ({ row }) => {
          if (!isEditMode) {
            return (
              <span>
                {formatAttendanceTenantTimeDisplay(row.checkout_time) ||
                  formatAttendanceTenantTime(row.checkout_time)}
              </span>
            );
          }
          const eventDate = attendanceEventDate(row.event);
          const rowKey = String(row.id);
          const pending = teacherPendingRef.current[rowKey];
          const isCorrectableRow = canCorrectTeacherRow(row, correctionOptions);

          if (isCorrectableRow) {
            return (
              <InlineTimeSelect
                use12Hour
                value={
                  pending?.checkoutHHmm ??
                  formatAttendanceTenantTime(row.checkout_time)
                }
                onChange={(v) =>
                  setTeacherPending((prev) => ({
                    ...prev,
                    [rowKey]: {
                      ...prev[rowKey],
                      checkoutHHmm: v,
                      eventDate,
                    },
                  }))
                }
              />
            );
          }

          return (
            <span>
              {formatAttendanceTenantTimeDisplay(row.checkout_time) ||
                formatAttendanceTenantTime(row.checkout_time)}
            </span>
          );
        },
      },
      {
        id: "checkin_image",
        header: "Screenshot",
        accessor: (row) => row.checkin_image,
        enableSorting: false,
        cell: ({ row }) => {
          const rowKey = String(row.id);
          const pending = teacherPendingRef.current[rowKey];
          const isCorrectableRow = canCorrectTeacherRow(row, correctionOptions);
          const fileInputId = `checkin-screenshot-${row.id}`;

          if (isEditMode && isCorrectableRow) {
            return (
              <div className="space-y-1">
                {row.checkin_image ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setViewImageUrl(row.checkin_image || null)}
                  >
                    View
                  </Button>
                ) : null}
                <input
                  id={fileInputId}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const eventDate = attendanceEventDate(row.event);
                    setTeacherPending((prev) => ({
                      ...prev,
                      [rowKey]: {
                        ...prev[rowKey],
                        checkinImage: file,
                        eventDate,
                      },
                    }));
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    document.getElementById(fileInputId)?.click()
                  }
                >
                  {pending?.checkinImage ? "Change photo" : "Select photo"}
                </Button>
                {pending?.checkinImage ? (
                  <p className="max-w-40 truncate text-xs text-text-muted">
                    {pending.checkinImage.name}
                  </p>
                ) : (
                  <p className="text-xs text-text-muted">
                    {isCheckinTimeChanging(
                      row,
                      pending,
                      formatAttendanceTenantTime,
                    )
                      ? "Required when correcting check-in"
                      : row.checkin_image
                        ? "Optional — replace photo if needed"
                        : "Optional"}
                  </p>
                )}
              </div>
            );
          }

          if (!row.checkin_image) return <span />;
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
      {
        id: "today_activities",
        header: "Today's activities",
        accessor: (row) => row.today_activities,
        enableSorting: false,
        cell: ({ row }) => {
          const rowKey = String(row.id);
          const pending = teacherPendingRef.current[rowKey];
          const isCorrectableRow = canCorrectTeacherRow(row, correctionOptions);

          if (isEditMode && isCorrectableRow) {
            return (
              <CheckinCorrectionTodayActivitiesField
                rowKey={rowKey}
                initialValue={row.today_activities ?? ""}
                disabled={teacherSaveMutation.isPending}
                onValueChange={handleTodayActivitiesChange}
              />
            );
          }

          const text = row.today_activities;
          if (!text) {
            return <span className="text-text-muted">—</span>;
          }
          const display = text.length > 80 ? `${text.slice(0, 80)}…` : text;
          return (
            <span title={text} className="block max-w-xs truncate">
              {display}
            </span>
          );
        },
      },
    );

    if (canAdminEdit) {
      cols.push({
        id: "is_extra_class",
        header: "Extra Class",
        accessor: (row) => row.is_extra_class,
        enableSorting: false,
        cell: ({ row }) => {
          if (!isEditMode) {
            return <span>{row.is_extra_class ? "Yes" : "No"}</span>;
          }
          const pending = pendingEdits[String(row.id)]?.is_extra_class;
          const value =
            pending !== undefined ? pending : row.is_extra_class;
          return (
            <Selector
              label="Extra Class"
              value={value ? "Yes" : "No"}
              options={[
                { label: "Yes", value: "Yes" },
                { label: "No", value: "No" },
              ]}
              onChange={(v) =>
                setPending(row.id, {
                  is_extra_class: v === "Yes",
                })
              }
              showOnlyInlineLable={true}
            />
          );
        },
      });
    }

    return cols;
  }, [
    canAdminCorrectTeachers,
    canAdminEdit,
    canTeacherSelfEdit,
    formatEventSessionLabel,
    formatAttendanceTenantTime,
    formatAttendanceTenantTimeDisplay,
    handleTodayActivitiesChange,
    hasMultipleSessions,
    isEditMode,
    openCorrectionSheet,
    pendingEdits,
    setPending,
    tab,
    tenant?.timezone,
    teacherSaveMutation.isPending,
    user,
  ]);

  if (eventsLoading || events.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader />
        <span className="ml-2">Loading events…</span>
      </div>
    );
  }

  if (!selectedDay || selectedEventIds.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="ml-2">No event selected</span>
      </div>
    );
  }

  return (
    <PageContainer width="wide" className="space-y-4">
      <div className="flex justify-between items-center">
        <BackButton href={`/courses/${id}`} />
      </div>

      <Separator />

      <div className="flex justify-end">
        <Button
          variant="ghost"
          className="space-x-2"
          onClick={() => {
            const idx = getTodayDayIndex();
            if (idx !== -1) changeCurrentDay(idx);
          }}
          disabled={
            getTodayDayIndex() === -1 || selectedDayIndex === getTodayDayIndex()
          }
        >
          <p className="text-sm underline">Go to ({formatDate(new Date())})</p>
          <ArrowRightCircle className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex justify-between items-center">
        <Button
          variant="secondary"
          className="space-x-2"
          disabled={selectedDayIndex <= 0}
          onClick={() => changeCurrentDay(selectedDayIndex - 1)}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Previous</span>
        </Button>

        <div className="flex flex-col items-center gap-1">
          <Select
            className="w-[min(100vw-8rem,340px)] font-mono tracking-wider"
            items={dayOptions.map((day, index) => ({
              value: String(index),
              label: formatDayLabel(day.events, day.dateKey),
            }))}
            value={String(selectedDayIndex)}
            onValueChange={(v) => {
              if (v != null) changeCurrentDay(Number(v));
            }}
          />
        </div>

        <Button
          variant="secondary"
          className="space-x-2"
          disabled={selectedDayIndex >= dayOptions.length - 1}
          onClick={() => changeCurrentDay(selectedDayIndex + 1)}
        >
          <span>Next</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4 border-b border-border p-5">
        {hasMultipleSessions && selectedDay && (
          <p className="mb-4 text-sm text-text-muted">
            {selectedDay.events.length} classes on{" "}
            {formatDate(selectedDay.dateKey)}
          </p>
        )}
        <Tabs defaultValue="teachers" searchParam="tab">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="teachers">Teachers</TabsTrigger>
              <TabsTrigger value="students">Students</TabsTrigger>
            </TabsList>

            {timezoneOffset && tenant?.timezone && (
              <div className="text-xs text-text-muted">
                {tenant.timezone} ({timezoneOffset})
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            {user && showEditControls && (
              <DataTableEditControls
                isEditMode={isEditMode}
                isLoading={
                  saveMutation.isPending || teacherSaveMutation.isPending
                }
                onEdit={() => setIsEditMode(true)}
                onDone={() => {
                  const teacherRows = teachersList.rows ?? [];
                  const hasCorrectionChanges = Object.entries(
                    teacherPending,
                  ).some(([rowKey, edit]) => {
                    const row = teacherRows.find(
                      (item: Attendance) => String(item.id) === rowKey,
                    );
                    if (!row || !canCorrectTeacherRow(row, {
                      canAdminCorrectTeachers,
                      canTeacherSelfEdit,
                      userId: user?.id,
                    })) {
                      return false;
                    }
                    return teacherPendingHasChanges(
                      row,
                      edit,
                      formatAttendanceTenantTime,
                    );
                  });
                  const hasExtraClassChanges = Object.values(pendingEdits).some(
                    (edit) => edit.is_extra_class !== undefined,
                  );

                  if (!hasCorrectionChanges && !hasExtraClassChanges) {
                    setIsEditMode(false);
                    setTeacherPending({});
                    clearPending();
                    return;
                  }

                  if (hasCorrectionChanges) {
                    const missingScreenshot = Object.entries(
                      teacherPending,
                    ).some(([rowKey, edit]) => {
                      const row = teacherRows.find(
                        (item: Attendance) => String(item.id) === rowKey,
                      );
                      if (
                        !row ||
                        !canCorrectTeacherRow(row, {
                          canAdminCorrectTeachers,
                          canTeacherSelfEdit,
                          userId: user?.id,
                        })
                      ) {
                        return false;
                      }
                      return correctionMissingRequiredScreenshot(
                        row,
                        edit,
                        formatAttendanceTenantTime,
                      );
                    });
                    if (missingScreenshot) {
                      toast.add({
                        title: "Screenshot required",
                        description:
                          "Select a check-in screenshot when correcting check-in time.",
                      });
                      return;
                    }
                    setReasonDialogOpen(true);
                    return;
                  }

                  saveMutation.mutate();
                }}
                onCancel={() => {
                  setIsEditMode(false);
                  clearPending();
                  setTeacherPending({});
                }}
                editIcon={<Edit className="h-4 w-4" />}
                doneIcon={<Edit className="h-4 w-4" />}
              />
            )}
          </div>

          <TabsContent value="teachers">
            <ResourceTable
              list={teachersList}
              tableState={teacherTableState}
              columns={columns}
              getRowId={(row) => String(row.id)}
            />
          </TabsContent>

          <TabsContent value="students">
            <ResourceTable
              list={studentsList}
              tableState={studentTableState}
              columns={columns}
              getRowId={(row) => String(row.id)}
            />
          </TabsContent>
        </Tabs>
      </div>
      <FullScreenImageViewer
        imageUrl={viewImageUrl}
        title="Screenshot"
        onClose={() => setViewImageUrl(null)}
      />
      <TeacherCheckinCorrectionDialog
        open={reasonDialogOpen}
        onOpenChange={setReasonDialogOpen}
        isLoading={teacherSaveMutation.isPending}
        onConfirm={(reason) => teacherSaveMutation.mutate(reason)}
      />
      <AttendanceCorrectionHistorySheet
        attendanceId={correctionSheet?.attendanceId ?? 0}
        teacherName={correctionSheet?.teacherName ?? ""}
        sessionLabel={correctionSheet?.sessionLabel}
        onClose={closeCorrectionSheet}
      />
    </PageContainer>
  );
}
