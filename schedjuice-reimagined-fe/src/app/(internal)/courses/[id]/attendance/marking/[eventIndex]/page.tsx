"use client";

import { PageContainer } from "@/components/layout/page-container";
import {
  getAttendanceMarkingBootstrap,
  getMarkingRoster,
} from "@/app/client-api/attendance-marking";
import { AttendanceMarkingHeader } from "@/components/attendance/attendance-marking-header";
import { AttendanceMarkingTable } from "@/components/attendance/attendance-marking-table";
import {
  AttendanceMarkingTableEmpty,
  AttendanceMarkingTableError,
  AttendanceMarkingTableSkeleton,
} from "@/components/attendance/attendance-marking-table-states";
import { AttendanceMarkingToolbar } from "@/components/attendance/attendance-marking-toolbar";
import {
  applyMarkAllPresentUndo,
  applyMarkUnregisteredAbsent,
  buildMarkAllPresentSnapshot,
  buildMarkUnregisteredAbsentSnapshot,
} from "@/components/attendance/mark-all-present-undo-core";
import { useMarkAllPresentUndo } from "@/components/attendance/use-mark-all-present-undo";
import type { AttendanceDirtyEditKind } from "@/components/attendance/attendance-autosave-debounce";
import { useAttendanceAutosave } from "@/components/attendance/use-attendance-autosave";
import { useToast } from "@/components/primitives";
import {
  getAdjacentTeachingDayIndex,
  getTodayEventIndex,
  getTodayYmd,
  formatEventTeachingDayLabel,
  formatTeachingDayYmd,
  resolveEventYmd,
  resolvePreferredEventIndex,
  type MarkingEvent,
} from "@/helpers/attendance-marking";
import {
  computeAttendanceMarkingSummary,
  ensureAttendanceRow,
  findAttendanceRowById,
  mergeRosterWithLocalEdits,
  rosterSyncFingerprint,
  sameAttendanceRowId,
  toAttendanceType,
} from "@/helpers/attendance-marking-roster";
import { formatAbsenceListCopy } from "@/helpers/format-absence-list-copy";
import { useIncludeRemovedStudents } from "@/hooks/use-include-removed-students";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTenant } from "@/hooks/useTenant";
import { crossfadeInstant, crossfadeOpacity, transition } from "@/lib/sj/motion";
import { attendanceStatus, type MarkingRosterRow } from "@/types/attendance";
import { courseType } from "@/types/course";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const ROW_HIGHLIGHT_MS = 2000;

const CourseAttendancePage: React.FC = () => {
  const [dirtyIds, setDirtyIds] = useState<number[]>([]);
  const [dirtyRevision, setDirtyRevision] = useState(0);
  const [dirtyEditKind, setDirtyEditKind] =
    useState<AttendanceDirtyEditKind>("status");
  const [dirtyKindByRow, setDirtyKindByRow] = useState<
    Record<number, AttendanceDirtyEditKind>
  >({});
  const [optimisticHighlightIds, setOptimisticHighlightIds] = useState<number[]>(
    [],
  );
  const [attendances, setAttendances] = useState<
    ReturnType<typeof toAttendanceType>[]
  >([]);
  const [hydratedEventId, setHydratedEventId] = useState<number | null>(null);
  const { eventIndex: rawEventIndex, id } = useParams<{
    id: string;
    eventIndex: string;
  }>();

  const pathname = usePathname();
  const toast = useToast();
  const router = useRouter();
  const isMobile = useIsMobile();
  const reducedMotion = useReducedMotion();
  const tableCrossfade = reducedMotion ? crossfadeInstant : crossfadeOpacity;
  const markAllUndo = useMarkAllPresentUndo();
  const queryClient = useQueryClient();
  const loadedEventIdRef = useRef<number | null>(null);
  const prevEventIdRef = useRef<number | null>(null);
  const lastRosterSyncKeyRef = useRef<string | null>(null);
  const attendancesRef = useRef(attendances);
  attendancesRef.current = attendances;
  const staggerEntranceRef = useRef(false);
  const initialEntranceConsumedRef = useRef(false);
  const dirtyIdsRef = useRef(dirtyIds);
  dirtyIdsRef.current = dirtyIds;
  const rosterDataRef = useRef<
    ReturnType<typeof toAttendanceType>[] | undefined
  >(undefined);
  const highlightTimersRef = useRef<Record<number, number>>({});

  const markRowHighlighted = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    setOptimisticHighlightIds((prev) => Array.from(new Set([...prev, ...ids])));
    for (const rowId of ids) {
      if (highlightTimersRef.current[rowId] != null) {
        window.clearTimeout(highlightTimersRef.current[rowId]);
      }
      highlightTimersRef.current[rowId] = window.setTimeout(() => {
        setOptimisticHighlightIds((prev) => prev.filter((id) => id !== rowId));
        delete highlightTimersRef.current[rowId];
      }, ROW_HIGHLIGHT_MS);
    }
  }, []);

  const { tenant } = useTenant();
  const { includeRemoved, setIncludeRemoved, canToggle } =
    useIncludeRemovedStudents(id);

  const bootstrapQuery = useQuery({
    queryKey: ["attendanceMarkingBootstrap", id, includeRemoved],
    queryFn: () => getAttendanceMarkingBootstrap(id, null, includeRemoved),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const timezone =
    bootstrapQuery.data?.tenant_timezone ?? tenant?.timezone ?? "UTC";
  const todayYmd = bootstrapQuery.data?.today_ymd ?? getTodayYmd(timezone);

  const events = useMemo(
    () => (bootstrapQuery.data?.events ?? []) as MarkingEvent[],
    [bootstrapQuery.data?.events],
  );

  const course = useMemo((): courseType | null => {
    const raw = bootstrapQuery.data?.course;
    if (!raw) return null;
    return raw as unknown as courseType;
  }, [bootstrapQuery.data?.course]);

  useEffect(() => {
    const activeEventId = bootstrapQuery.data?.active_event_id;
    const roster = bootstrapQuery.data?.roster;
    if (activeEventId == null || roster == null) return;
    queryClient.setQueryData<MarkingRosterRow[]>(
      ["attendanceMarkingRoster", activeEventId, includeRemoved],
      roster,
    );
  }, [
    bootstrapQuery.data?.active_event_id,
    bootstrapQuery.data?.roster,
    queryClient,
    includeRemoved,
  ]);

  useEffect(() => {
    if (!events.length) return;

    const preferredIndex = resolvePreferredEventIndex(
      events,
      bootstrapQuery.data?.preferred_event_id,
      timezone,
      todayYmd,
    );

    if (rawEventIndex === "today") {
      if (preferredIndex >= 0) {
        router.replace(`/courses/${id}/attendance/marking/${preferredIndex}`);
      }
      return;
    }

    const currentIndex = Number(rawEventIndex);
    const isValidIndex =
      !Number.isNaN(currentIndex) &&
      currentIndex >= 0 &&
      currentIndex < events.length;

    if (!isValidIndex && preferredIndex >= 0) {
      router.replace(`/courses/${id}/attendance/marking/${preferredIndex}`);
    }
  }, [
    events,
    rawEventIndex,
    id,
    router,
    todayYmd,
    timezone,
    bootstrapQuery.data?.preferred_event_id,
  ]);

  const effectiveEventIndex = useMemo(() => {
    if (!events.length) return -1;

    if (rawEventIndex === "today") {
      return resolvePreferredEventIndex(
        events,
        bootstrapQuery.data?.preferred_event_id,
        timezone,
        todayYmd,
      );
    }

    const idx = Number(rawEventIndex);
    if (Number.isNaN(idx) || idx < 0 || idx >= events.length) {
      return resolvePreferredEventIndex(
        events,
        bootstrapQuery.data?.preferred_event_id,
        timezone,
        todayYmd,
      );
    }

    return idx;
  }, [
    events,
    rawEventIndex,
    todayYmd,
    timezone,
    bootstrapQuery.data?.preferred_event_id,
  ]);

  const eventIndex = effectiveEventIndex;
  const currentEventId = events[eventIndex]?.id;

  const bootstrapRosterRows = useMemo(() => {
    if (!bootstrapQuery.data || currentEventId == null) return undefined;
    if (bootstrapQuery.data.active_event_id !== currentEventId) return undefined;
    return bootstrapQuery.data.roster.map(toAttendanceType);
  }, [bootstrapQuery.data, currentEventId]);

  const rosterQuery = useQuery({
    queryKey: ["attendanceMarkingRoster", currentEventId, includeRemoved],
    queryFn: async () => {
      const data = await getMarkingRoster(currentEventId!, includeRemoved);
      queryClient.setQueryData<MarkingRosterRow[]>(
        ["attendanceMarkingRoster", currentEventId, includeRemoved],
        data.roster,
      );
      return data.roster.map(toAttendanceType);
    },
    enabled:
      currentEventId != null &&
      bootstrapQuery.isSuccess &&
      bootstrapRosterRows == null,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: () => {
      if (bootstrapRosterRows) return bootstrapRosterRows;
      if (currentEventId == null) return undefined;
      const cached = queryClient.getQueryData<MarkingRosterRow[]>([
        "attendanceMarkingRoster",
        currentEventId,
        includeRemoved,
      ]);
      if (!cached) return undefined;
      return cached.map(toAttendanceType);
    },
    initialData: bootstrapRosterRows,
  });

  rosterDataRef.current = rosterQuery.data;

  const isBootstrapLoading = bootstrapQuery.isLoading && events.length === 0;

  const hasValidSession =
    effectiveEventIndex >= 0 &&
    effectiveEventIndex < events.length &&
    events[effectiveEventIndex]?.id != null;

  const isRosterLoading =
    hasValidSession &&
    rosterQuery.isFetching &&
    attendances.length === 0 &&
    rosterQuery.data == null;

  const isRosterHydrated =
    currentEventId != null &&
    hydratedEventId === currentEventId &&
    rosterQuery.data != null &&
    (attendances.length > 0 || rosterQuery.data.length === 0);

  const isNoSessions =
    !isBootstrapLoading &&
    !bootstrapQuery.isLoading &&
    bootstrapQuery.isSuccess &&
    events.length === 0;

  useEffect(() => {
    if (currentEventId == null) return;
    if (prevEventIdRef.current === currentEventId) return;

    const isInitialMount = prevEventIdRef.current === null;
    prevEventIdRef.current = currentEventId;

    if (isInitialMount) return;

    loadedEventIdRef.current = null;
    lastRosterSyncKeyRef.current = null;
    setHydratedEventId(null);
    setAttendances([]);
    attendancesRef.current = [];
    setDirtyIds([]);
    dirtyIdsRef.current = [];
    setDirtyRevision(0);
    markAllUndo.clear();
  }, [currentEventId, markAllUndo.clear]);

  useLayoutEffect(() => {
    if (!rosterQuery.data || currentEventId == null) return;

    const rows = rosterQuery.data.map(ensureAttendanceRow);
    const syncKey = rosterSyncFingerprint(currentEventId, rows);
    const isNewEvent = loadedEventIdRef.current !== currentEventId;

    if (!isNewEvent && syncKey === lastRosterSyncKeyRef.current) {
      return;
    }

    lastRosterSyncKeyRef.current = syncKey;

    if (isNewEvent) {
      loadedEventIdRef.current = currentEventId;
      setHydratedEventId(currentEventId);
      setAttendances(rows);
      attendancesRef.current = rows;
      setDirtyIds([]);
      dirtyIdsRef.current = [];
      setDirtyRevision(0);
      return;
    }

    if (dirtyIdsRef.current.length === 0) {
      setAttendances(rows);
    } else {
      setAttendances((prev) =>
        mergeRosterWithLocalEdits(prev, rows, dirtyIdsRef.current),
      );
    }
    setHydratedEventId(currentEventId);
  }, [rosterQuery.data, currentEventId]);

  const prevTeachingDayIndex =
    eventIndex >= 0
      ? getAdjacentTeachingDayIndex(events, eventIndex, "prev", timezone)
      : null;
  const nextTeachingDayIndex =
    eventIndex >= 0
      ? getAdjacentTeachingDayIndex(events, eventIndex, "next", timezone)
      : null;

  useEffect(() => {
    if (!events.length || eventIndex < 0) return;

    for (const adj of [prevTeachingDayIndex, nextTeachingDayIndex]) {
      if (adj == null || adj < 0) continue;
      const adjEventId = events[adj]?.id;
      if (adjEventId == null) continue;

      void queryClient.prefetchQuery({
        queryKey: ["attendanceMarkingRoster", adjEventId, includeRemoved],
        queryFn: async () => {
          const data = await getMarkingRoster(adjEventId, includeRemoved);
          return data.roster.map(toAttendanceType);
        },
        staleTime: 30_000,
      });
    }
  }, [
    events,
    eventIndex,
    prevTeachingDayIndex,
    nextTeachingDayIndex,
    queryClient,
    includeRemoved,
  ]);

  const clearDirtyIds = useCallback((ids: number[]) => {
    setDirtyIds((prev) => {
      const next = prev.filter((rowId) => !ids.includes(rowId));
      dirtyIdsRef.current = next;
      return next;
    });
    setDirtyKindByRow((prev) => {
      const next = { ...prev };
      for (const rowId of ids) {
        delete next[rowId];
      }
      return next;
    });
  }, []);

  const {
    status: autosaveStatus,
    savingIndicatorVisible,
    lastSavedAt,
    rowStates,
    recentlyChangedIds,
    retryNow,
    waitForFlush,
    getPendingPayload,
    flushWithKeepalive,
    flushPendingSave,
    hasPendingChanges,
  } = useAttendanceAutosave({
    attendances,
    attendancesRef,
    dirtyIds,
    dirtyIdsRef,
    dirtyRevision,
    dirtyEditKind,
    dirtyKindByRow,
    enabled: isRosterHydrated && !rosterQuery.isError,
    onDirtyClear: clearDirtyIds,
  });

  const displayRecentlyChangedIds = useMemo(
    () =>
      Array.from(new Set([...optimisticHighlightIds, ...recentlyChangedIds])),
    [optimisticHighlightIds, recentlyChangedIds],
  );

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (
        hasPendingChanges ||
        getPendingPayload().length > 0 ||
        autosaveStatus === "saving"
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    const handlePageHide = () => {
      flushWithKeepalive();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPendingSave("normal");
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    autosaveStatus,
    flushWithKeepalive,
    flushPendingSave,
    getPendingPayload,
    hasPendingChanges,
  ]);

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(highlightTimersRef.current)) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  const markDirty = useCallback(
    (rowId: number, editKind: AttendanceDirtyEditKind) => {
      setDirtyIds((prev) => {
        const next = prev.includes(rowId) ? prev : [...prev, rowId];
        dirtyIdsRef.current = next;
        return next;
      });
      setDirtyKindByRow((prev) => ({ ...prev, [rowId]: editKind }));
      setDirtyEditKind(editKind);
      setDirtyRevision((revision) => revision + 1);
    },
    [],
  );

  const handleStatusChange = useCallback(
    (rowId: number, status: attendanceStatus) => {
      const prev = attendancesRef.current;
      const existing =
        findAttendanceRowById(prev, rowId) ??
        findAttendanceRowById(rosterDataRef.current ?? [], rowId);

      if (!existing) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            `[attendance marking] Row ${rowId} not found in local state`,
          );
        }
        return;
      }

      if (existing.attendance_status === status) {
        if (!findAttendanceRowById(prev, rowId)) {
          setAttendances((current) => {
            const next = [...current, existing];
            attendancesRef.current = next;
            return next;
          });
        }
        return;
      }

      const updated = { ...existing, attendance_status: status };
      setAttendances((current) => {
        const rowIndex = current.findIndex((item) =>
          sameAttendanceRowId(item.id, rowId),
        );
        const next =
          rowIndex === -1
            ? [...current, updated]
            : (() => {
                const copy = [...current];
                copy[rowIndex] = updated;
                return copy;
              })();
        attendancesRef.current = next;
        return next;
      });
      markDirty(existing.id, "status");
      markRowHighlighted([existing.id]);
    },
    [markDirty, markRowHighlighted],
  );

  const handleNoteChange = useCallback(
    (rowId: number, note: string) => {
      const prev = attendancesRef.current;
      const existing =
        findAttendanceRowById(prev, rowId) ??
        findAttendanceRowById(rosterDataRef.current ?? [], rowId);

      if (!existing) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            `[attendance marking] Row ${rowId} not found in local state`,
          );
        }
        return;
      }

      const currentNote = existing.attendance_note || "";
      if (currentNote === note) return;

      setAttendances((current) => {
        const rowIndex = current.findIndex((item) =>
          sameAttendanceRowId(item.id, rowId),
        );
        const next =
          rowIndex === -1
            ? [...current, { ...existing, attendance_note: note }]
            : (() => {
                const copy = [...current];
                copy[rowIndex] = { ...copy[rowIndex], attendance_note: note };
                return copy;
              })();
        attendancesRef.current = next;
        return next;
      });
      markDirty(existing.id, "note");
    },
    [markDirty],
  );

  const changeCurrentEvent = useCallback(
    async (newEventIndex: number) => {
      if (newEventIndex === eventIndex) return;
      await waitForFlush(3000);
      router.push(`/courses/${id}/attendance/marking/${newEventIndex}`);
    },
    [eventIndex, waitForFlush, router, id],
  );

  const todayIndex = getTodayEventIndex(events, timezone, todayYmd);

  const handleGoToToday = useCallback(async () => {
    if (todayIndex !== -1) {
      await changeCurrentEvent(todayIndex);
      return;
    }
    toast.add({
      description: `No class for ${formatTeachingDayYmd(todayYmd)}.`,
    });
  }, [todayIndex, changeCurrentEvent, toast, todayYmd]);

  const handleMarkAllUndo = useCallback(() => {
    const snapshot = markAllUndo.undo();
    if (snapshot == null || snapshot.size === 0) return;

    const restoredIds = Array.from(snapshot.keys());
    setAttendances((prev) => {
      const next = applyMarkAllPresentUndo(prev, snapshot);
      attendancesRef.current = next;
      return next;
    });
    setDirtyIds((prev) => {
      const next = Array.from(new Set([...prev, ...restoredIds]));
      dirtyIdsRef.current = next;
      return next;
    });
    setDirtyKindByRow((prev) => {
      const next = { ...prev };
      for (const rowId of restoredIds) {
        next[rowId] = "status";
      }
      return next;
    });
    setDirtyEditKind("status");
    setDirtyRevision((revision) => revision + 1);
    markRowHighlighted(restoredIds);
  }, [markAllUndo, markRowHighlighted]);

  const markAllAsPresent = () => {
    const snapshot = buildMarkAllPresentSnapshot(attendances);
    if (snapshot.size === 0) return;

    const changedIds = Array.from(snapshot.keys());
    const next = attendances.map((row) => ({
      ...row,
      attendance_status: attendanceStatus.present,
    }));

    setAttendances(next);
    attendancesRef.current = next;
    setDirtyIds((prev) => {
      const nextDirty = Array.from(new Set([...prev, ...changedIds]));
      dirtyIdsRef.current = nextDirty;
      return nextDirty;
    });
    setDirtyKindByRow((prev) => {
      const next = { ...prev };
      for (const rowId of changedIds) {
        next[rowId] = "status";
      }
      return next;
    });
    setDirtyEditKind("status");
    setDirtyRevision((revision) => revision + 1);
    markRowHighlighted(changedIds);
    markAllUndo.offer(snapshot);
  };

  const markUnregisteredAsAbsent = () => {
    const snapshot = buildMarkUnregisteredAbsentSnapshot(attendances);
    if (snapshot.size === 0) return;

    const changedIds = Array.from(snapshot.keys());
    const next = applyMarkUnregisteredAbsent(attendances, snapshot);

    setAttendances(next);
    attendancesRef.current = next;
    setDirtyIds((prev) => {
      const nextDirty = Array.from(new Set([...prev, ...changedIds]));
      dirtyIdsRef.current = nextDirty;
      return nextDirty;
    });
    setDirtyKindByRow((prev) => {
      const nextKinds = { ...prev };
      for (const rowId of changedIds) {
        nextKinds[rowId] = "status";
      }
      return nextKinds;
    });
    setDirtyEditKind("status");
    setDirtyRevision((revision) => revision + 1);
    markRowHighlighted(changedIds);
    markAllUndo.offer(snapshot);
  };

  const { presentCount, totalCount, presentPercent } =
    computeAttendanceMarkingSummary(attendances);

  const currentEvent = events[eventIndex];
  const pageDateLabel = currentEvent
    ? formatEventTeachingDayLabel(currentEvent, timezone)
    : null;
  const isViewingToday =
    currentEvent != null &&
    resolveEventYmd(currentEvent, timezone) === todayYmd;

  const hasUnregisteredStudents = attendances.some(
    (row) => row.attendance_status === attendanceStatus.unregistered,
  );

  const copyAbsenceList = () => {
    if (currentEvent == null) return;
    const studentNames = attendances
      .filter((row) => row.attendance_status === attendanceStatus.absent)
      .map((row) => row.user.name);
    const block = formatAbsenceListCopy({
      className: course?.title ?? "",
      dateYmd: resolveEventYmd(currentEvent, timezone),
      presentCount,
      totalCount,
      presentPercent,
      studentNames,
    });
    void navigator.clipboard.writeText(block).then(() => {
      toast.add({ description: "Copied absence list" });
    });
  };

  const rosterActionsReady =
    hasValidSession &&
    isRosterHydrated &&
    !isBootstrapLoading &&
    attendances.length > 0;

  const isLoading =
    isBootstrapLoading ||
    isRosterLoading ||
    (hasValidSession && !isRosterHydrated && !rosterQuery.isError);
  const loadingLabel = isBootstrapLoading
    ? "Loading sessions…"
    : "Loading attendance roster…";

  const isError = bootstrapQuery.isError || rosterQuery.isError;
  const isEmpty =
    isNoSessions ||
    (isRosterHydrated &&
      !bootstrapQuery.isError &&
      !rosterQuery.isError &&
      attendances.length === 0);
  const emptyPreset = isNoSessions ? "noSessions" : "noStudentsToMark";
  const emptyDescription = isNoSessions
    ? "This course has no scheduled sessions yet. Set up the course schedule to start marking attendance."
    : "This class session has no enrolled students yet. Add students to the course to start marking attendance.";

  const handleRetry = () => {
    void bootstrapQuery.refetch();
    void rosterQuery.refetch();
  };

  if (!staggerEntranceRef.current && !isLoading && !isEmpty) {
    staggerEntranceRef.current = true;
  }

  const enableStaggerEntrance =
    staggerEntranceRef.current && !initialEntranceConsumedRef.current;

  const handleInitialEntranceLatched = useCallback(() => {
    initialEntranceConsumedRef.current = true;
  }, []);

  return (
    <PageContainer width="full" className="space-y-4">
      <AttendanceMarkingHeader
        courseId={id}
        course={course}
        events={events}
        eventIndex={eventIndex}
        pathname={pathname}
        currentEvent={currentEvent}
        pageDateLabel={pageDateLabel}
        isViewingToday={isViewingToday}
        todayLabel={formatTeachingDayYmd(todayYmd)}
        timezone={timezone}
        prevTeachingDayIndex={prevTeachingDayIndex}
        nextTeachingDayIndex={nextTeachingDayIndex}
        isBootstrapLoading={isBootstrapLoading}
        onGoToToday={() => void handleGoToToday()}
        onChangeEventIndex={(index) => void changeCurrentEvent(index)}
      />

      <AttendanceMarkingToolbar
        presentCount={presentCount}
        totalCount={totalCount}
        presentPercent={presentPercent}
        autosaveStatus={autosaveStatus}
        hasPendingChanges={hasPendingChanges}
        savingIndicatorVisible={savingIndicatorVisible}
        lastSavedAt={lastSavedAt}
        onRetryAutosave={retryNow}
        onMarkAllPresent={markAllAsPresent}
        onMarkUnregisteredAbsent={markUnregisteredAsAbsent}
        onCopyAbsenceList={copyAbsenceList}
        onUndoMarkAll={handleMarkAllUndo}
        markAllDisabled={!rosterActionsReady || markAllUndo.isVisible}
        markUnregisteredDisabled={
          !rosterActionsReady ||
          !hasUnregisteredStudents ||
          markAllUndo.isVisible
        }
        copyAbsenceListDisabled={!rosterActionsReady}
        undoVisible={markAllUndo.isVisible}
        canToggleIncludeRemoved={canToggle}
        includeRemoved={includeRemoved}
        onIncludeRemovedChange={setIncludeRemoved}
      />

      {isError ? (
        <AttendanceMarkingTableError onRetry={handleRetry} />
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          {isLoading ? (
            <motion.div
              key="loading"
              initial={false}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0 } }}
            >
              <AttendanceMarkingTableSkeleton
                loadingLabel={loadingLabel}
                isMobile={isMobile}
              />
            </motion.div>
          ) : isEmpty ? (
            <motion.div
              key="empty"
              variants={tableCrossfade}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <AttendanceMarkingTableEmpty
                emptyPreset={emptyPreset}
                emptyDescription={emptyDescription}
              />
            </motion.div>
          ) : (
            <div key={eventIndex}>
              <AttendanceMarkingTable
                rows={attendances}
                sortResetKey={currentEventId}
                isMobile={isMobile}
                rowStates={rowStates}
                recentlyChangedIds={displayRecentlyChangedIds}
                onStatusChange={handleStatusChange}
                onNoteChange={handleNoteChange}
                enableStaggerEntrance={enableStaggerEntrance}
                onInitialEntranceLatched={handleInitialEntranceLatched}
              />
            </div>
          )}
        </AnimatePresence>
      )}
    </PageContainer>
  );
};

export default CourseAttendancePage;
