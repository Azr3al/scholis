"use client";
import { Button, Dialog, buttonVariants, useToast } from "@/components/primitives";

import { useForm, Controller } from "react-hook-form";
import { useMoveLead } from "@/hooks/leads/use-leads-board";
import { scheduleScrollToFirstFormError } from "@/helpers/form";
import type { Lead, LeadStatus } from "@/types/lead";
import {
  AppointmentFormFields,
  type AppointmentFormValues,
} from "./appointment-form-fields";

export function AppointmentDialog({
  lead,
  targetStatus,
  onClose,
}: {
  lead: Lead;
  targetStatus: LeadStatus;
  onClose: () => void;
}) {
  const move = useMoveLead();
  const toast = useToast();
  const form = useForm<AppointmentFormValues>({
    defaultValues: {
      scheduled_at: null,
      platform: "ZOOM",
      consultant: "",
      meeting_link: "",
      notes: "",
    },
  });

  function onSubmit(values: AppointmentFormValues) {
    if (!values.scheduled_at) return;

    move.mutate(
      {
        leadId: lead.id,
        statusId: targetStatus.id,
        appointment: {
          scheduled_at: values.scheduled_at.toISOString(),
          platform: values.platform,
          consultant: values.consultant ? Number(values.consultant) : null,
          meeting_link: values.meeting_link,
          notes: values.notes,
        },
      },
      {
        onSuccess: () => {
          toast.add({ title: "Appointment booked" });
          onClose();
        },
        onError: () => {
          toast.add({ title: "Could not book appointment", type: "error" });
        },
      },
    );
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
        <div>
          <Dialog.Title>Book appointment — {lead.name}</Dialog.Title>
        </div>
        <div {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, () =>
              scheduleScrollToFirstFormError(form),
            )}
            className="space-y-4"
          >
            <AppointmentFormFields control={form.control} />
            <div>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" isLoading={move.isPending}>
                Book & move
              </Button>
            </div>
          </form>
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
