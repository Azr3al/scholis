"use client";

import { Button, Field, Input } from "@/components/primitives";
import { LwtpBookingDetailsForm } from "@/components/consultation/public/lwtp-booking-details-form";
import { formatDate, formatSessionClock } from "@/helpers/date";
import type { LwtpBookingDetailsPayload } from "@/lib/consultation/lwtp-booking-fields";
import type {
  ConsultationAvailabilitySlot,
  ConsultationPublicBookingOptions,
} from "@/types/consultation";
import { ConsultationStrategy } from "@/types/organization";
import { useState } from "react";

export type BookingDetailsSubmitValues = {
  student_name: string;
  student_email: string;
  details?: LwtpBookingDetailsPayload;
};

type BookingDetailsFormProps = {
  selectedDate: Date;
  selectedSlot: ConsultationAvailabilitySlot;
  consultationStrategy: string;
  bookingOptions?: ConsultationPublicBookingOptions;
  onSubmit: (values: BookingDetailsSubmitValues) => void;
  isSubmitting: boolean;
  errorMessage: string | null;
};

function DefaultBookingDetailsForm({
  selectedDate,
  selectedSlot,
  onSubmit,
  isSubmitting,
  errorMessage,
}: Omit<BookingDetailsFormProps, "consultationStrategy" | "bookingOptions">) {
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const dateLabel = formatDate(selectedDate, "EEEE, MMMM d, yyyy");
  const timeLabel = formatSessionClock(selectedSlot.slot_time);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const name = studentName.trim();
    const email = studentEmail.trim();
    if (!name) {
      setLocalError("Name is required.");
      return;
    }
    if (!email) {
      setLocalError("Email is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setLocalError("Enter a valid email address.");
      return;
    }
    setLocalError(null);
    onSubmit({ student_name: name, student_email: email });
  }

  const displayError = localError ?? errorMessage;

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm">
        <p className="font-medium text-text-primary">{dateLabel}</p>
        <p className="text-text-secondary">{timeLabel}</p>
      </div>

      <Field.Root name="student_name">
        <Field.Label>Name</Field.Label>
        <Input
          value={studentName}
          onChange={(event) => setStudentName(event.target.value)}
          autoComplete="name"
          disabled={isSubmitting}
          required
        />
      </Field.Root>

      <Field.Root name="student_email">
        <Field.Label>Email</Field.Label>
        <Input
          type="email"
          value={studentEmail}
          onChange={(event) => setStudentEmail(event.target.value)}
          autoComplete="email"
          disabled={isSubmitting}
          required
        />
        <Field.Description>
          Used for your meeting invite and cancellation link.
        </Field.Description>
      </Field.Root>

      {displayError ? (
        <p className="text-sm text-danger" role="alert">
          {displayError}
        </p>
      ) : null}

      <Button type="submit" isLoading={isSubmitting} className="w-full sm:w-auto">
        Confirm booking
      </Button>
    </form>
  );
}

export function BookingDetailsForm({
  consultationStrategy,
  bookingOptions,
  ...props
}: BookingDetailsFormProps) {
  if (consultationStrategy === ConsultationStrategy.lwtp) {
    if (!bookingOptions) {
      return (
        <p className="text-sm text-text-secondary" aria-busy="true">
          Loading booking options…
        </p>
      );
    }

    return (
      <LwtpBookingDetailsForm
        {...props}
        bookingOptions={bookingOptions}
        onSubmit={({ student_name, student_email, details }) =>
          props.onSubmit({ student_name, student_email, details })
        }
      />
    );
  }

  return <DefaultBookingDetailsForm {...props} />;
}
