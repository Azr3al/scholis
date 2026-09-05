"use client";

import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { axiosClient } from "@/lib/api";
import { useToast } from "@/components/primitives";
import { Button } from "@/components/primitives";
import { Dialog } from "@/components/primitives";
import { useRef, useState } from "react";
import { Camera, Upload } from "iconoir-react";
import Image from "next/image";
import { queryClient } from "@/lib/query";
import { assertSchedjuiceSuccess } from "@/lib/schedjuice-api-response";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { resolvePayrollRateMissingMessage } from "@/helpers/checkin-payroll-rate-message";
import { userCheckinStatusQueryKey } from "@/hooks/useUserCheckin";
import { useUser } from "@/hooks/useUser";
import { formatTimeInUserTimezone } from "@/helpers/timeslot";
import { getUserTimezoneInfo } from "@/helpers/date";
import { useTenant } from "@/hooks/useTenant";
import { formatCheckinOpensAt } from "@/helpers/checkin-window";
import { resolveTimeDisplayFormat } from "@/helpers/time-format";
import {
  CheckinBlockReason,
  UserCheckinCurrentEvent,
} from "@/types/attendance";
import { Checkbox } from "@/components/primitives";
import { Field } from "@/components/primitives";
import { Textarea } from "@/components/primitives";
import { cn } from "@/lib/utils";

export type UserCheckinPopupMode = "checkin" | "checkout";

export interface UserCheckinPopupStatus {
  hasEventsToday: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  currentEvent?: UserCheckinCurrentEvent | null;
  totalEvents: number;
  completedEvents: number;
  hasStaleOpenSession?: boolean;
  checkinOpensAt?: string | null;
  checkinBlockReason?: CheckinBlockReason | null;
  checkinBlockMessage?: string | null;
}

interface UserCheckinPopupProps {
  courseId: string;
  mode: UserCheckinPopupMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: UserCheckinPopupStatus;
}

export const UserCheckinPopup = ({
  courseId,
  mode,
  open,
  onOpenChange,
  status,
}: UserCheckinPopupProps) => {
  const toast = useToast();
  const { tenant } = useTenant();
  const { user } = useUser();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isExtraClass, setIsExtraClass] = useState(false);
  const [todayActivities, setTodayActivities] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canCheckIn = status.canCheckIn;
  const currentEvent = status.currentEvent;
  const totalEvents = status.totalEvents;
  const completedEvents = status.completedEvents;
  const hasStaleOpenSession = status.hasStaleOpenSession ?? false;
  const checkinOpensAt = status.checkinOpensAt ?? null;
  const checkinBlockReason = status.checkinBlockReason ?? null;
  const checkinBlockMessage = status.checkinBlockMessage ?? null;
  const payrollRateMissingMessage = resolvePayrollRateMissingMessage(
    user,
    checkinBlockMessage,
  );
  const userTimezoneInfo = getUserTimezoneInfo();
  const graceMinutes = tenant?.checkin_grace_period_minute ?? 5;
  const isCheckoutMode = mode === "checkout";

  const resetFormState = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setTodayActivities("");
    setIsExtraClass(false);
  };

  const checkinMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await axiosClient.post(
        `attendances/user-checkin/${courseId}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return assertSchedjuiceSuccess(response);
    },
    onSuccess: () => {
      toast.add({ title: "Successfully checked in" });
      onOpenChange(false);
      resetFormState();
      queryClient.invalidateQueries({
        queryKey: userCheckinStatusQueryKey(courseId),
      });
      queryClient.invalidateQueries({ queryKey: ["getCourse", courseId] });
    },
    onError: (error) => {
      const description = parseSchedjuiceApiError(error);
      const apiCode = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string } | undefined)?.message
        : undefined;
      if (apiCode === "payroll_rate_missing") {
        toast.add({
          title: resolvePayrollRateMissingMessage(user, description),
        });
        return;
      }
      toast.add({
        title: "Failed to check in",
        description,
      });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (payload: { today_activities?: string }) => {
      const response = await axiosClient.put(
        `attendances/user-checkin/${courseId}`,
        payload,
      );
      return assertSchedjuiceSuccess(response);
    },
    onSuccess: () => {
      toast.add({ title: "Successfully checked out" });
      onOpenChange(false);
      resetFormState();
      queryClient.invalidateQueries({
        queryKey: userCheckinStatusQueryKey(courseId),
      });
      queryClient.invalidateQueries({ queryKey: ["getCourse", courseId] });
    },
    onError: (error) => {
      toast.add({
        title: "Failed to check out",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCheckin = () => {
    if (!selectedImage) {
      toast.add({
        title: "Please select an image",
      });
      return;
    }

    const formData = new FormData();
    formData.append("is_extra_class", isExtraClass.toString());
    formData.append("checkin_image", selectedImage);
    checkinMutation.mutate(formData);
  };

  const handleCheckout = () => {
    const trimmedActivities = todayActivities.trim();
    checkoutMutation.mutate({
      ...(trimmedActivities ? { today_activities: trimmedActivities } : {}),
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      resetFormState();
    }
  };

  const formatEventTimes = (event: {
    time_from?: string;
    time_to?: string;
  }) => {
    if (!event.time_from || !event.time_to) return "Time not specified";
    return `${formatTimeInUserTimezone(
      event.time_from,
      tenant?.timezone,
      userTimezoneInfo.timezone,
    )} - ${formatTimeInUserTimezone(
      event.time_to,
      tenant?.timezone,
      userTimezoneInfo.timezone,
    )}`;
  };

  const getDescription = () => {
    if (isCheckoutMode) {
      return hasStaleOpenSession
        ? "You have an open check-in from a previous session. Please check out to continue."
        : "Wrap up your session and check out. You can note what you covered today (optional).";
    }
    if (checkinBlockReason === "checkin_too_early" && checkinOpensAt) {
      const opensAtLabel = formatCheckinOpensAt(
        checkinOpensAt,
        tenant?.timezone,
        timeFormat,
      );
      return `Check-in opens at ${opensAtLabel}. You can check in up to ${graceMinutes} minutes before the session starts.`;
    }
    if (checkinBlockReason === "checkin_after_event_end") {
      return "This session has ended. Check-in is no longer available.";
    }
    if (checkinBlockReason === "payroll_rate_missing") {
      return payrollRateMissingMessage;
    }
    return `Please take a photo to check in for the next event. (${completedEvents}/${totalEvents} completed)`;
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="flex max-h-[min(90dvh,720px)] w-[calc(100vw-2rem)] max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="shrink-0 space-y-1.5 px-6 pb-4 pt-6 pr-12">
            <Dialog.Title>
              {isCheckoutMode ? "Check Out" : "Check In"}
            </Dialog.Title>
            <Dialog.Description>{getDescription()}</Dialog.Description>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4">
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground text-center">
                {userTimezoneInfo.full}
              </div>
              {isCheckoutMode ? (
                <div className="space-y-4">
                  {currentEvent ? (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <h4 className="mb-1 font-semibold text-blue-900">
                        {currentEvent.event?.title || "Current Event"}
                      </h4>
                      <p className="text-sm text-blue-700">
                        {formatEventTimes(currentEvent.event ?? {})}
                      </p>
                    </div>
                  ) : null}
                  <Field.Root className="space-y-2">
                    <Field.Label htmlFor="today_activities">
                      Today&apos;s activities
                    </Field.Label>
                    <Field.Description className="text-xs text-muted-foreground">
                      What did you cover in this session? (optional)
                    </Field.Description>
                    <Textarea
                      id="today_activities"
                      value={todayActivities}
                      onChange={(e) => setTodayActivities(e.target.value)}
                      placeholder="Describe what you did in class today…"
                      rows={3}
                      disabled={checkoutMutation.isPending}
                      className="min-h-[4.5rem] resize-y"
                    />
                  </Field.Root>
                </div>
              ) : canCheckIn ? (
                <div className="space-y-4">
                  {currentEvent ? (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                      <h4 className="mb-1 font-semibold text-green-900">
                        {currentEvent.event?.title || "Next Event"}
                      </h4>
                      <p className="text-sm text-green-700">
                        {formatEventTimes(currentEvent.event ?? {})}
                      </p>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Check-in Photo</label>
                    <div className="rounded-lg border-2 border-dashed border-gray-300 p-4 text-center">
                      {imagePreview ? (
                        <div className="space-y-2">
                          <Image
                            src={imagePreview}
                            alt="Check-in preview"
                            width={128}
                            height={128}
                            className="mx-auto h-28 w-28 rounded-lg object-cover sm:h-32 sm:w-32"
                          />
                          <p className="text-sm text-muted-foreground">
                            Photo selected
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Camera className="mx-auto h-8 w-8 text-gray-400" />
                          <p className="text-sm text-muted-foreground">
                            No photo selected, Please select a photo.
                          </p>
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                    <Button
                      variant="secondary"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full"
                      disabled={checkinMutation.isPending}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      {selectedImage ? "Change Photo" : "Select Photo"}
                    </Button>
                  </div>
                  <Field.Root
                    className={cn(
                      "flex flex-row items-center gap-2 rounded-md border p-3 shadow-sm sm:p-4",
                      isExtraClass && "border-success bg-success/10",
                    )}
                  >
                    <Checkbox
                      id="is_extra_class"
                      checked={isExtraClass}
                      onCheckedChange={(checked) =>
                        setIsExtraClass(checked === true)
                      }
                      disabled={checkinMutation.isPending}
                    />
                    <Field.Label htmlFor="is_extra_class">
                      Extra Class
                    </Field.Label>
                  </Field.Root>
                </div>
              ) : checkinBlockReason === "checkin_too_early" ||
                checkinBlockReason === "checkin_after_event_end" ||
                checkinBlockReason === "payroll_rate_missing" ? (
                <StatusNotice message={getDescription()} />
              ) : (
                <StatusNotice
                  message={`All events for today have been completed! (${completedEvents}/${totalEvents})`}
                />
              )}
            </div>
          </div>

          {isCheckoutMode ? (
            <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-stretch">
              <Button
                onClick={handleCheckout}
                className="w-full"
                variant="danger"
                isLoading={checkoutMutation.isPending}
              >
                Check Out
              </Button>
            </div>
          ) : canCheckIn ? (
            <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-stretch">
              <Button
                onClick={handleCheckin}
                disabled={!selectedImage}
                className="w-full"
                isLoading={checkinMutation.isPending}
              >
                Check In
              </Button>
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

const StatusNotice = ({ message }: { message: string }) => (
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">{message}</p>
    <Button disabled className="w-full" variant="secondary">
      {message}
    </Button>
  </div>
);
