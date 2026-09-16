"use client";

import {
  fetchConsultationBookingLink,
  rotateConsultationBookingLink,
} from "@/app/client-api/consultation";
import { AlertDialog, Button, Input, Skeleton, useToast } from "@/components/primitives";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { readinessMissingMessages } from "@/lib/consultation/readiness-copy";
import { toAbsoluteWebUrl } from "@/lib/public-web-paths";
import { crossfadeInstant, crossfadeOpacity } from "@/lib/sj/motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Refresh, WarningTriangle, ClipboardCheck as CopyCheck, Copy } from "iconoir-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

export const consultationBookingLinkQueryKey = ["consultation", "booking-link"] as const;

export function BookingLinkCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();
  const loadingVariants = reducedMotion ? crossfadeInstant : crossfadeOpacity;
  const [isCopied, setIsCopied] = useState(false);
  const [copyBlockedOpen, setCopyBlockedOpen] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const bookingLinkQuery = useQuery({
    queryKey: consultationBookingLinkQueryKey,
    queryFn: fetchConsultationBookingLink,
  });

  const rotateMutation = useMutation({
    mutationFn: rotateConsultationBookingLink,
    onSuccess: (data) => {
      queryClient.setQueryData(consultationBookingLinkQueryKey, data);
      setRotateOpen(false);
      toast.add({ title: "New booking link created" });
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not create a new link",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const data = bookingLinkQuery.data;
  const readiness = data?.readiness;
  const isBookable = readiness?.is_bookable ?? false;
  const missing = readiness?.missing ?? [];
  const url = useMemo(
    () => toAbsoluteWebUrl(data?.url ?? "", origin),
    [data?.url, origin],
  );

  function handleCopy() {
    if (!url) return;
    if (!isBookable) {
      setCopyBlockedOpen(true);
      return;
    }
    void navigator.clipboard.writeText(url).then(() => {
      setIsCopied(true);
      toast.add({ description: "Copied to clipboard" });
      window.setTimeout(() => setIsCopied(false), 1000);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {!isBookable && readiness ? (
        <div
          role="status"
          className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <WarningTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">Booking link not ready</p>
            <ul className="list-disc space-y-0.5 pl-4 text-amber-800 dark:text-amber-200">
              {readinessMissingMessages(missing).map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
            <p className="pt-1 text-amber-800 dark:text-amber-200">
              Students may see &quot;not found&quot; until setup is complete. If
              you already shared an old link, create a new one after fixing setup.
            </p>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-sm font-medium">Public booking link</label>
        <div className="relative min-h-10">
          <AnimatePresence mode="wait" initial={false}>
            {bookingLinkQuery.isLoading ? (
              <motion.div
                key="booking-link-loading"
                variants={loadingVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <Skeleton className="h-10 w-full" aria-busy="true" />
              </motion.div>
            ) : (
              <motion.div
                key="booking-link-loaded"
                variants={loadingVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex flex-wrap items-center gap-2"
              >
                <Input className="h-10 min-w-0 flex-1" readOnly value={url || "—"} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 px-2"
                  disabled={!url}
                  aria-label="Copy booking link"
                  onClick={handleCopy}
                >
                  {isCopied ? (
                    <CopyCheck className="size-4" aria-hidden />
                  ) : (
                    <Copy className="size-4" aria-hidden />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0 gap-1"
                  disabled={rotateMutation.isPending}
                  onClick={() => setRotateOpen(true)}
                >
                  <Refresh className="size-4" aria-hidden />
                  New link
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <p className="text-sm text-muted-foreground">
          Share this link so students can book a 30-minute consultation. No login
          required.
        </p>
      </div>

      <AlertDialog.Root open={copyBlockedOpen} onOpenChange={setCopyBlockedOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>Complete setup first</AlertDialog.Title>
            <div className="mt-2 space-y-1 text-sm text-text-secondary">
              {readinessMissingMessages(missing).map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <AlertDialog.Close render={<Button variant="secondary">OK</Button>} />
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <AlertDialog.Root open={rotateOpen} onOpenChange={setRotateOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>Create a new booking link?</AlertDialog.Title>
            <div className="mt-2 space-y-2 text-sm text-text-secondary">
              <p>
                Your current link stops working immediately. Anyone with the old
                URL will see &quot;not found&quot; until you share the new link.
              </p>
              <ul className="list-disc space-y-1 pl-4">
                <li>Update syllabi, emails, and anywhere else you posted the old link.</li>
                <li>
                  Existing bookings stay on your calendar; students keep their
                  confirmation and cancel links.
                </li>
              </ul>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <AlertDialog.Close
                render={
                  <Button variant="secondary" disabled={rotateMutation.isPending}>
                    Keep current link
                  </Button>
                }
              />
              <Button
                variant="primary"
                isLoading={rotateMutation.isPending}
                disabled={rotateMutation.isPending}
                onClick={() => rotateMutation.mutate()}
              >
                Create new link
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
