"use client";
import { Button, useToast } from "@/components/primitives";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { OpenNewWindow as ExternalLink } from "iconoir-react";
import Link from "next/link";

import { scheduleScrollToFirstFormError } from "@/helpers/form";
import { updateAppointment } from "@/lib/leads-api";
import type { LeadAppointment } from "@/types/lead";
import {
  AppointmentFormFields,
  type AppointmentFormValues,
} from "./appointment-form-fields";
import { appointmentPlatformDisplay } from "./appointment-platform-display";
import { MeetingPlatformBadge } from "./meeting-platform-badge";

function toFormValues(appointment: LeadAppointment): AppointmentFormValues {
  return {
    scheduled_at: new Date(appointment.scheduled_at),
    platform: appointment.platform,
    consultant: appointment.consultant ? String(appointment.consultant) : "",
    meeting_link: appointment.meeting_link ?? "",
    notes: appointment.notes ?? "",
  };
}

export function AppointmentDetailPanel({
  appointment,
  onSaved,
}: {
  appointment: LeadAppointment;
  onSaved: () => void;
}) {
  const toast = useToast();
  const form = useForm<AppointmentFormValues>({
    defaultValues: toFormValues(appointment),
  });

  useEffect(() => {
    form.reset(toFormValues(appointment));
  }, [appointment, form]);

  const save = useMutation({
    mutationFn: (values: AppointmentFormValues) => {
      if (!values.scheduled_at) {
        return Promise.reject(new Error("Date and time are required"));
      }
      return updateAppointment(appointment.id, {
        scheduled_at: values.scheduled_at.toISOString(),
        platform: values.platform,
        consultant: values.consultant ? Number(values.consultant) : null,
        meeting_link: values.meeting_link,
        notes: values.notes,
      });
    },
    onSuccess: () => {
      toast.add({ title: "Appointment updated" });
      onSaved();
    },
    onError: () => {
      toast.add({ title: "Could not update appointment", type: "error" });
    },
  });

  const meetingLink = form.watch("meeting_link");
  const platform = form.watch("platform");
  const { icon, label } = appointmentPlatformDisplay({
    platform,
    meeting_link: meetingLink ?? "",
  });

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-hover p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-text-muted">
            Appointment details
          </h4>
          <MeetingPlatformBadge
            icon={icon}
            label={label}
            className="text-sm text-text-primary"
          />
        </div>
        {meetingLink ? (
          <Link
            href={meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            Open meeting link
            <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        ) : null}
      </div>

      <div {...form}>
        <form
          onSubmit={form.handleSubmit(
            (values) => save.mutate(values),
            () => scheduleScrollToFirstFormError(form),
          )}
          className="space-y-3"
        >
          <AppointmentFormFields control={form.control} />
          <div className="flex justify-end pt-1">
            <Button type="submit" size="sm" isLoading={save.isPending}>
              Save changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
