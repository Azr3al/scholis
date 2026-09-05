"use client";

import { useMutation } from "@tanstack/react-query";
import { axiosClient } from "@/lib/api";
import { Button, Dialog, useToast } from "@/components/primitives";
import { queryClient } from "@/lib/query";
import { assertSchedjuiceSuccess } from "@/lib/schedjuice-api-response";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { userCheckinStatusQueryKey } from "@/hooks/useUserCheckin";
import { openCheckinSessionQueryKey } from "@/hooks/useOpenCheckinSession";
import { formatTimeInUserTimezone } from "@/helpers/timeslot";
import { getUserTimezoneInfo } from "@/helpers/date";
import { useTenant } from "@/hooks/useTenant";
import type { OpenCheckinSession } from "@/types/attendance";

interface PendingCheckoutBeforeCheckinDialogProps {
  targetCourseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blockingOpenSession: OpenCheckinSession;
  onCheckoutSuccess: () => void;
}

function formatEventTimes(
  event: { time_from?: string; time_to?: string },
  tenantTimezone: string | undefined,
  userTimezone: string,
) {
  if (!event.time_from || !event.time_to) {
    return "Time not specified";
  }
  return `${formatTimeInUserTimezone(
    event.time_from,
    tenantTimezone,
    userTimezone,
  )} - ${formatTimeInUserTimezone(event.time_to, tenantTimezone, userTimezone)}`;
}

export function PendingCheckoutBeforeCheckinDialog({
  targetCourseId,
  open,
  onOpenChange,
  blockingOpenSession,
  onCheckoutSuccess,
}: PendingCheckoutBeforeCheckinDialogProps) {
  const toast = useToast();
  const { tenant } = useTenant();
  const userTimezoneInfo = getUserTimezoneInfo();
  const checkoutCourseId = String(blockingOpenSession.course_id);
  const isCrossCourse = checkoutCourseId !== targetCourseId;
  const openSessionEvent = blockingOpenSession.user_event;

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const response = await axiosClient.put(
        `attendances/user-checkin/${checkoutCourseId}`,
        {},
      );
      return assertSchedjuiceSuccess(response);
    },
    onSuccess: async () => {
      toast.add({ title: "Successfully checked out" });
      await queryClient.invalidateQueries({
        queryKey: ["user-checkin-status"],
      });
      queryClient.invalidateQueries({ queryKey: openCheckinSessionQueryKey });
      queryClient.invalidateQueries({
        queryKey: userCheckinStatusQueryKey(targetCourseId),
      });
      queryClient.invalidateQueries({
        queryKey: userCheckinStatusQueryKey(checkoutCourseId),
      });
      queryClient.invalidateQueries({ queryKey: ["getCourse", targetCourseId] });
      queryClient.invalidateQueries({
        queryKey: ["getCourse", checkoutCourseId],
      });
      onOpenChange(false);
      onCheckoutSuccess();
    },
    onError: (error) => {
      toast.add({
        title: "Failed to check out",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="flex max-h-[min(90dvh,720px)] w-[calc(100vw-2rem)] max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="shrink-0 space-y-1.5 px-6 pb-4 pt-6 pr-12">
            <Dialog.Title>Check out first</Dialog.Title>
            <Dialog.Description>
              {isCrossCourse
                ? `You need to check out from ${blockingOpenSession.course_title} before you can check in here.`
                : "You need to check out from your previous session before you can check in to the current one."}
            </Dialog.Description>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              {isCrossCourse ? (
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-blue-800">
                  {blockingOpenSession.course_title}
                </p>
              ) : null}
              <h4 className="mb-1 font-semibold text-blue-900">
                {openSessionEvent.event?.title || "Previous session"}
              </h4>
              <p className="text-sm text-blue-700">
                {formatEventTimes(
                  openSessionEvent.event ?? {},
                  tenant?.timezone,
                  userTimezoneInfo.timezone,
                )}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-stretch">
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
              disabled={checkoutMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              className="w-full sm:flex-1"
              variant="danger"
              onClick={() => checkoutMutation.mutate()}
              isLoading={checkoutMutation.isPending}
            >
              Check Out
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
