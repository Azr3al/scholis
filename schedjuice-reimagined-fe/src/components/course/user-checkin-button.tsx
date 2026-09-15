"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/primitives";
import {
  UserCheckinPopup,
  type UserCheckinPopupStatus,
} from "./user-checkin-popup";
import { PendingCheckoutBeforeCheckinDialog } from "./pending-checkout-before-checkin-dialog";
import { CancelCheckinDialog } from "./cancel-checkin-dialog";
import { Camera, Clock, LogOut, XmarkCircle } from "iconoir-react";
import { CheckinStatus, type OpenCheckinSession } from "@/types/attendance";
import {
  useUserCheckin,
  userCheckinStatusQueryKey,
} from "@/hooks/useUserCheckin";
import {
  useOpenCheckinSession,
  openCheckinSessionQueryKey,
} from "@/hooks/useOpenCheckinSession";
import { useTenant } from "@/hooks/useTenant";
import { formatCheckinOpensAt } from "@/helpers/checkin-window";
import { resolveTimeDisplayFormat } from "@/helpers/time-format";
import {
  getBlockingOpenSession,
  isCheckInDisabled,
  isCheckOutDisabled,
  needsCheckoutBeforeCheckIn,
  shouldShowCheckIn,
  shouldShowCheckOut,
  type UserCheckinActionInput,
} from "@/helpers/user-checkin-actions";
import {
  CancelCheckinReason,
  canCancelTeacherCheckin,
  normalizeCancelCheckinNote,
} from "@/helpers/cancel-checkin";
import { axiosClient } from "@/lib/api";
import { queryClient } from "@/lib/query";
import { assertSchedjuiceSuccess } from "@/lib/schedjuice-api-response";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { useToast } from "@/components/primitives";

interface UserCheckinButtonProps {
  courseId: string;
  enabled?: boolean;
}

function resolveOpenCheckinSession(
  courseId: string,
  courseOpenSession: OpenCheckinSession | null | undefined,
  globalOpenSession: OpenCheckinSession | null | undefined,
  currentStatus: CheckinStatus,
  canCheckOut: boolean,
  currentEvent: OpenCheckinSession["user_event"] | undefined,
): OpenCheckinSession | null {
  if (courseOpenSession) {
    return courseOpenSession;
  }
  if (globalOpenSession) {
    return globalOpenSession;
  }
  if (
    currentStatus === CheckinStatus.checked_in &&
    canCheckOut &&
    currentEvent
  ) {
    return {
      course_id: Number(courseId),
      course_title: "",
      user_event: currentEvent,
    };
  }
  return null;
}

export const UserCheckinButton = ({
  courseId,
  enabled = true,
}: UserCheckinButtonProps) => {
  const { tenant } = useTenant();
  const toast = useToast();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const {
    currentStatus,
    hasEventsToday,
    canCheckIn,
    canCheckOut,
    currentEvent,
    openCheckinSession: courseOpenCheckinSession,
    totalEvents,
    completedEvents,
    hasStaleOpenSession,
    checkinOpensAt,
    checkinBlockReason,
    checkinBlockMessage,
    isLoading: isCourseStatusLoading,
  } = useUserCheckin(courseId, enabled);
  const {
    openCheckinSession: globalOpenCheckinSession,
    isLoading: isGlobalOpenSessionLoading,
  } = useOpenCheckinSession(enabled);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [pendingCheckoutOpen, setPendingCheckoutOpen] = useState(false);
  const [cancelCheckinOpen, setCancelCheckinOpen] = useState(false);

  const cancelCheckinMutation = useMutation({
    mutationFn: async (payload: {
      reasonCode: CancelCheckinReason;
      note?: string;
    }) => {
      const response = await axiosClient.post(
        `attendances/user-checkin/${courseId}/cancel`,
        {
          reason_code: payload.reasonCode,
          note: payload.note ?? null,
        },
        {
          headers: { "X-Schedjuice-Client": "web" },
        },
      );
      return assertSchedjuiceSuccess(response);
    },
    onSuccess: () => {
      toast.add({ title: "Check-in cancelled" });
      setCancelCheckinOpen(false);
      queryClient.invalidateQueries({
        queryKey: userCheckinStatusQueryKey(courseId),
      });
      queryClient.invalidateQueries({ queryKey: openCheckinSessionQueryKey });
      queryClient.invalidateQueries({ queryKey: ["getCourse", courseId] });
    },
    onError: (error) => {
      toast.add({
        title: "Failed to cancel check-in",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const resolvedOpenCheckinSession = useMemo(
    () =>
      resolveOpenCheckinSession(
        courseId,
        courseOpenCheckinSession,
        globalOpenCheckinSession,
        currentStatus,
        canCheckOut,
        currentEvent,
      ),
    [
      courseId,
      courseOpenCheckinSession,
      globalOpenCheckinSession,
      currentStatus,
      canCheckOut,
      currentEvent,
    ],
  );

  const isLoading = isCourseStatusLoading || isGlobalOpenSessionLoading;

  const actionInput: UserCheckinActionInput = useMemo(
    () => ({
      courseId,
      currentStatus,
      hasEventsToday,
      canCheckIn,
      canCheckOut,
      totalEvents,
      completedEvents,
      hasStaleOpenSession,
      checkinBlockReason,
      checkinBlockMessage,
      openCheckinSession: resolvedOpenCheckinSession,
      isLoading,
    }),
    [
      courseId,
      currentStatus,
      hasEventsToday,
      canCheckIn,
      canCheckOut,
      totalEvents,
      completedEvents,
      hasStaleOpenSession,
      checkinBlockReason,
      checkinBlockMessage,
      resolvedOpenCheckinSession,
      isLoading,
    ],
  );

  const showCheckOut = shouldShowCheckOut(actionInput);
  const showCheckIn = shouldShowCheckIn(actionInput);
  const blockCheckInWithModal = needsCheckoutBeforeCheckIn(actionInput);
  const blockingOpenSession = getBlockingOpenSession(actionInput);
  const checkInDisabled = isCheckInDisabled(actionInput);
  const checkOutDisabled = isCheckOutDisabled(actionInput);
  const showCancelCheckin =
    showCheckOut && canCancelTeacherCheckin(tenant) && !checkOutDisabled;
  const isCrossCourseBlock =
    blockingOpenSession != null &&
    String(blockingOpenSession.course_id) !== String(courseId);

  const popupStatus: UserCheckinPopupStatus = {
    hasEventsToday,
    canCheckIn,
    canCheckOut,
    currentEvent,
    totalEvents,
    completedEvents,
    hasStaleOpenSession,
    checkinOpensAt,
    checkinBlockReason,
    checkinBlockMessage,
  };

  const getCheckInLabel = () => {
    if (blockCheckInWithModal && isCrossCourseBlock) {
      return "Check In";
    }
    if (!hasEventsToday) {
      return "No Events Today";
    }
    if (currentStatus === CheckinStatus.checked_out) {
      return "All Events Completed";
    }
    if (checkinBlockReason === "checkin_too_early" && checkinOpensAt) {
      return `Check-in opens at ${formatCheckinOpensAt(checkinOpensAt, tenant?.timezone, timeFormat)}`;
    }
    if (checkinBlockReason === "checkin_after_event_end") {
      return "Session ended";
    }
    if (checkinBlockReason === "payroll_rate_missing") {
      return "Hourly rate missing";
    }
    return "Check In";
  };

  const getCheckInIcon = () => {
    if (blockCheckInWithModal && isCrossCourseBlock) {
      return <Camera className="md:mr-2 h-4 w-4" />;
    }
    if (
      currentStatus === CheckinStatus.checked_out ||
      checkinBlockReason === "checkin_too_early" ||
      checkinBlockReason === "checkin_after_event_end" ||
      checkinBlockReason === "payroll_rate_missing"
    ) {
      return <Clock className="md:mr-2 h-4 w-4" />;
    }
    return <Camera className="md:mr-2 h-4 w-4" />;
  };

  const getCheckInVariant = () => {
    if (blockCheckInWithModal && isCrossCourseBlock) {
      return "primary" as const;
    }
    if (
      currentStatus === CheckinStatus.checked_out ||
      checkinBlockReason === "checkin_too_early" ||
      checkinBlockReason === "checkin_after_event_end" ||
      checkinBlockReason === "payroll_rate_missing"
    ) {
      return "secondary" as const;
    }
    return "primary" as const;
  };

  const handleCheckInClick = () => {
    if (blockCheckInWithModal && blockingOpenSession) {
      setPendingCheckoutOpen(true);
      return;
    }
    setCheckinOpen(true);
  };

  if (currentStatus === CheckinStatus.checked_out && hasEventsToday) {
    return (
      <Button
        variant="secondary"
        disabled
        className="w-full gap-2 sm:w-auto sm:min-w-[8.5rem] active:scale-[0.98]"
      >
        <Clock className="md:mr-2 h-4 w-4" />
        <span>All Events Completed</span>
      </Button>
    );
  }

  if (!hasEventsToday && !showCheckOut && !showCheckIn) {
    return (
      <Button
        variant="secondary"
        disabled
        className="w-full gap-2 sm:w-auto sm:min-w-[8.5rem] active:scale-[0.98]"
      >
        <Clock className="md:mr-2 h-4 w-4" />
        <span>No Events Today</span>
      </Button>
    );
  }

  return (
    <>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
        {showCheckOut ? (
          <Button
            variant="primary"
            disabled={checkOutDisabled}
            className="w-full gap-2 sm:w-auto sm:min-w-[8.5rem] active:scale-[0.98]"
            onClick={() => setCheckoutOpen(true)}
          >
            <LogOut className="md:mr-2 h-4 w-4" />
            <span>Check Out</span>
          </Button>
        ) : null}
        {showCancelCheckin ? (
          <Button
            variant="danger"
            disabled={checkOutDisabled || cancelCheckinMutation.isPending}
            className="w-full gap-2 sm:w-auto sm:min-w-[8.5rem] active:scale-[0.98]"
            onClick={() => setCancelCheckinOpen(true)}
          >
            <XmarkCircle className="md:mr-2 h-4 w-4" />
            <span>Cancel check-in</span>
          </Button>
        ) : null}
        {showCheckIn ? (
          <Button
            variant={getCheckInVariant()}
            disabled={checkInDisabled}
            className="w-full gap-2 sm:w-auto sm:min-w-[8.5rem] active:scale-[0.98]"
            onClick={handleCheckInClick}
          >
            {getCheckInIcon()}
            <span>{getCheckInLabel()}</span>
          </Button>
        ) : null}
      </div>

      {showCheckOut ? (
        <UserCheckinPopup
          courseId={courseId}
          mode="checkout"
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          status={popupStatus}
        />
      ) : null}

      {showCancelCheckin ? (
        <CancelCheckinDialog
          open={cancelCheckinOpen}
          onOpenChange={setCancelCheckinOpen}
          isLoading={cancelCheckinMutation.isPending}
          onConfirm={({ reasonCode, note }) =>
            cancelCheckinMutation.mutate({
              reasonCode,
              note: normalizeCancelCheckinNote(note),
            })
          }
        />
      ) : null}

      {showCancelCheckin ? (
        <CancelCheckinDialog
          open={cancelCheckinOpen}
          onOpenChange={setCancelCheckinOpen}
          isLoading={cancelCheckinMutation.isPending}
          onConfirm={({ reasonCode, note }) =>
            cancelCheckinMutation.mutate({
              reasonCode,
              note: normalizeCancelCheckinNote(note),
            })
          }
        />
      ) : null}

      {showCancelCheckin ? (
        <CancelCheckinDialog
          open={cancelCheckinOpen}
          onOpenChange={setCancelCheckinOpen}
          isLoading={cancelCheckinMutation.isPending}
          onConfirm={({ reasonCode, note }) =>
            cancelCheckinMutation.mutate({
              reasonCode,
              note: normalizeCancelCheckinNote(note),
            })
          }
        />
      ) : null}

      {showCheckIn ? (
        <UserCheckinPopup
          courseId={courseId}
          mode="checkin"
          open={checkinOpen}
          onOpenChange={setCheckinOpen}
          status={popupStatus}
        />
      ) : null}

      {blockingOpenSession ? (
        <PendingCheckoutBeforeCheckinDialog
          targetCourseId={courseId}
          open={pendingCheckoutOpen}
          onOpenChange={setPendingCheckoutOpen}
          blockingOpenSession={blockingOpenSession}
          onCheckoutSuccess={() => setCheckinOpen(true)}
        />
      ) : null}
    </>
  );
};
