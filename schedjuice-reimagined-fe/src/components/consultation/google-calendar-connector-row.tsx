"use client";

import {
  fetchGoogleCalendarLinkAuthorizeUrl,
  fetchConsultationBookingLink,
  unlinkGoogleCalendar,
} from "@/app/client-api/consultation";
import { consultationBookingLinkQueryKey } from "@/components/consultation/booking-link-card";
import { GoogleIcon } from "@/components/connectors/connector-icons";
import { GoogleStatusChip } from "@/components/connectors/google-status-chip";
import ConfirmationDialog from "@/components/misc/confirmation-dialog";
import { Button, useToast } from "@/components/primitives";
import { parseGoogleOAuthReturn } from "@/helpers/login-composition";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { formatGoogleCalendarAccountLabel } from "@/lib/consultation/google-calendar-copy";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

function buildPathWithoutGoogleOAuth(searchParams: URLSearchParams): string {
  const params = new URLSearchParams(searchParams.toString());
  for (const key of [
    "google_oauth",
    "google_oauth_message",
    "google_oauth_details",
    "google_handoff",
  ]) {
    params.delete(key);
  }
  const qs = params.toString();
  return qs
    ? `${window.location.pathname}?${qs}`
    : window.location.pathname;
}

function resolveCalendarStatus(connected: boolean): string {
  return connected ? "linked" : "not_linked";
}

export function GoogleCalendarConnectorRow({
  user,
  viewerAccount,
  tenant,
}: {
  user: accountType;
  viewerAccount: accountType;
  tenant: organizationType | null;
  onUpdated?: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const handledReturnRef = useRef(false);
  const isSelf = viewerAccount.id === user.id;

  const bookingLinkQuery = useQuery({
    queryKey: consultationBookingLinkQueryKey,
    queryFn: fetchConsultationBookingLink,
    enabled: isSelf,
  });

  const connected =
    bookingLinkQuery.data?.readiness.google_calendar_connected ?? false;
  const accountLabel = formatGoogleCalendarAccountLabel(
    bookingLinkQuery.data?.google_calendar,
  );

  const linkMutation = useMutation({
    mutationFn: async () => {
      const authorizeUrl = await fetchGoogleCalendarLinkAuthorizeUrl(
        window.location.pathname + window.location.search,
      );
      window.location.assign(authorizeUrl);
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not connect Google Calendar",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: () => unlinkGoogleCalendar(),
    onSuccess: () => {
      toast.add({ title: "Google Calendar disconnected" });
      void queryClient.invalidateQueries({
        queryKey: consultationBookingLinkQueryKey,
      });
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not disconnect Google Calendar",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  useEffect(() => {
    if (!isSelf || handledReturnRef.current) {
      return;
    }
    const googleReturn = parseGoogleOAuthReturn(searchParams);
    if (!googleReturn) {
      return;
    }
    handledReturnRef.current = true;

    if (googleReturn.linkSuccess) {
      toast.add({ title: "Google Calendar connected" });
      void queryClient.invalidateQueries({
        queryKey: consultationBookingLinkQueryKey,
      });
    } else if (googleReturn.errorCode) {
      toast.add({
        type: "error",
        title: "Could not connect Google Calendar",
        description:
          googleReturn.errorDetails ?? "Google Calendar could not be connected.",
      });
    }

    router.replace(buildPathWithoutGoogleOAuth(searchParams));
  }, [isSelf, queryClient, router, searchParams, toast]);

  if (!tenant?.is_google_on || !tenant?.is_consultation_booking_on) {
    return null;
  }

  if (!isSelf) {
    return null;
  }

  const status = resolveCalendarStatus(connected);
  const isLinked = status === "linked";
  const isBusy =
    linkMutation.isLoading ||
    unlinkMutation.isLoading ||
    bookingLinkQuery.isLoading;

  return (
    <div
      className="grid grid-cols-1 gap-4 py-6 first:pt-0 last:pb-0 md:grid-cols-[auto_1fr_auto] md:items-start md:gap-6"
      style={{ animationDelay: "120ms" }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
        <GoogleIcon className="h-5 w-5" />
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium tracking-tight">Google Calendar</span>
          <GoogleStatusChip status={status} />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {isLinked ? (
            accountLabel ? (
              <>
                Signed in as{" "}
                <span className="font-medium text-foreground">{accountLabel}</span>
                . Uses your primary Google Calendar for open times and bookings.
              </>
            ) : (
              "Calendar is connected for consultation scheduling."
            )
          ) : (
            "Connect Google Calendar so students can see your open times."
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {!isLinked ? (
          <Button
            variant="primary"
            size="sm"
            disabled={isBusy}
            isLoading={linkMutation.isLoading}
            onClick={() => linkMutation.mutate()}
          >
            Connect Calendar
          </Button>
        ) : (
          <ConfirmationDialog
            title="Disconnect Google Calendar?"
            content="Students will not see your open times until you connect again."
            onConfirm={() => unlinkMutation.mutate()}
            isLoading={unlinkMutation.isLoading}
          >
            <Button variant="primary" size="sm" disabled={isBusy}>
              Disconnect
            </Button>
          </ConfirmationDialog>
        )}
      </div>
    </div>
  );
}
