"use client";

import {
  createConsultationPublicBooking,
  fetchConsultationAvailabilityDates,
  fetchConsultationAvailabilitySlots,
  fetchConsultationPublicBookingOptions,
  fetchConsultationPublicConfig,
} from "@/app/client-api/consultation";
import { Loader } from "@/components/form/loader";
import { PageContainer } from "@/components/layout/page-container";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/public/elevated-card";
import { Button } from "@/components/primitives";
import { BookingConfirmStep } from "@/components/consultation/public/booking-confirm-step";
import { BookingDetailsForm } from "@/components/consultation/public/booking-details-form";
import type { BookingDetailsSubmitValues } from "@/components/consultation/public/booking-details-form";
import {
  BookingMonthCalendar,
  formatConsultationMonthParam,
  selectedDateToYmd,
} from "@/components/consultation/public/booking-month-calendar";
import { BookingSlotPicker } from "@/components/consultation/public/booking-slot-picker";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { formatDate } from "@/helpers/date";
import {
  globalRoutePageWidth,
  resolveGlobalRouteLayout,
} from "@/lib/ui-remediation/r6-global-route-classes";
import type {
  ConsultationAvailabilitySlot,
  ConsultationPublicBookingResult,
} from "@/types/consultation";
import { ConsultationStrategy } from "@/types/organization";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

const PAGE_WIDTH = globalRoutePageWidth(
  resolveGlobalRouteLayout("/(public)/book-consultation/[slug]"),
);

export function consultationPublicConfigKey(slug: string) {
  return ["consultation", "public", "config", slug] as const;
}

export function consultationPublicBookingOptionsKey(slug: string) {
  return ["consultation", "public", "booking-options", slug] as const;
}

export function consultationPublicDatesKey(slug: string, month: string) {
  return ["consultation", "public", "dates", slug, month] as const;
}

export function consultationPublicSlotsKey(slug: string, date: string) {
  return ["consultation", "public", "slots", slug, date] as const;
}

type PublicBookingViewProps = {
  slug: string;
};

export function PublicBookingView({ slug }: PublicBookingViewProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<ConsultationAvailabilitySlot | null>(
    null,
  );
  const [confirmedBooking, setConfirmedBooking] =
    useState<ConsultationPublicBookingResult | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const monthParam = formatConsultationMonthParam(visibleMonth);
  const selectedDateYmd = selectedDateToYmd(selectedDate);

  const configQuery = useQuery({
    queryKey: consultationPublicConfigKey(slug),
    queryFn: () => fetchConsultationPublicConfig(slug),
    enabled: Boolean(slug),
  });

  const consultationStrategy =
    configQuery.data?.consultation_strategy ?? ConsultationStrategy.lwtp;
  const isLwtpStrategy = consultationStrategy === ConsultationStrategy.lwtp;

  const bookingOptionsQuery = useQuery({
    queryKey: consultationPublicBookingOptionsKey(slug),
    queryFn: () => fetchConsultationPublicBookingOptions(slug),
    enabled: Boolean(slug) && configQuery.isSuccess && isLwtpStrategy,
  });

  const datesQuery = useQuery({
    queryKey: consultationPublicDatesKey(slug, monthParam),
    queryFn: () => fetchConsultationAvailabilityDates(slug, monthParam),
    enabled: Boolean(slug) && configQuery.isSuccess,
    keepPreviousData: true,
  });

  const slotsQuery = useQuery({
    queryKey: consultationPublicSlotsKey(slug, selectedDateYmd ?? ""),
    queryFn: () => fetchConsultationAvailabilitySlots(slug, selectedDateYmd!),
    enabled: Boolean(slug) && Boolean(selectedDateYmd) && !confirmedBooking,
  });

  const bookingMutation = useMutation({
    mutationFn: (values: BookingDetailsSubmitValues) => {
      if (!selectedSlot) {
        throw new Error("Pick a time first.");
      }
      return createConsultationPublicBooking(slug, {
        scheduled_at: selectedSlot.scheduled_at,
        student_name: values.student_name,
        student_email: values.student_email,
        ...(values.details ? { details: values.details } : {}),
      });
    },
    onSuccess: (booking) => {
      setConfirmedBooking(booking);
      setBookingError(null);
    },
    onError: (error) => {
      setBookingError(
        parseSchedjuiceApiError(error, "Could not complete the booking."),
      );
    },
  });

  const consultantName = configQuery.data?.name ?? "Consultant";
  const slotDurationMinutes = configQuery.data?.slot_duration_minutes ?? 30;
  const timezoneLabel = configQuery.data?.timezone;

  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return "";
    return formatDate(selectedDate, "EEEE, MMMM d");
  }, [selectedDate]);

  function handleSelectDate(date: Date | undefined) {
    setSelectedDate(date);
    setSelectedSlot(null);
    setBookingError(null);
  }

  function handleSelectSlot(slot: ConsultationAvailabilitySlot) {
    setSelectedSlot(slot);
    setBookingError(null);
  }

  if (configQuery.isLoading) {
    return (
      <PageContainer width={PAGE_WIDTH} className="py-10 max-sm:py-5">
        <Card>
          <CardHeader>
            <CardTitle>Book a consultation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2" aria-busy="true">
              <Loader />
              <p className="text-sm text-text-secondary">Loading consultant…</p>
            </div>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  if (configQuery.isError) {
    return (
      <PageContainer width={PAGE_WIDTH} className="py-10 max-sm:py-5">
        <Card>
          <CardHeader>
            <CardTitle>Book a consultation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-text-secondary">
              This booking page is unavailable or the link is invalid.
            </p>
            <Button variant="secondary" onClick={() => configQuery.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer width={PAGE_WIDTH} className="py-10 max-sm:py-5">
      <Card>
        <CardHeader>
          <CardTitle>Book with {consultantName}</CardTitle>
          {timezoneLabel ? (
            <p className="text-sm text-text-secondary">
              Times shown in {timezoneLabel}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-8">
          {confirmedBooking ? (
            <BookingConfirmStep
              booking={confirmedBooking}
              consultantName={consultantName}
            />
          ) : (
            <>
              <section className="space-y-3">
                <h2 className="text-sm font-medium text-text-primary">Pick a date</h2>
                {datesQuery.isError ? (
                  <div className="space-y-3">
                    <p className="text-sm text-text-secondary">
                      Could not load availability. Try again in a moment.
                    </p>
                    <Button variant="secondary" onClick={() => datesQuery.refetch()}>
                      Retry
                    </Button>
                  </div>
                ) : (
                  <BookingMonthCalendar
                    visibleMonth={visibleMonth}
                    onVisibleMonthChange={setVisibleMonth}
                    selectedDate={selectedDate}
                    onSelectDate={handleSelectDate}
                    availableDates={datesQuery.data ?? []}
                    isLoading={datesQuery.isFetching}
                  />
                )}
              </section>

              {selectedDate ? (
                <section className="space-y-3">
                  <h2 className="text-sm font-medium text-text-primary">Pick a time</h2>
                  {slotsQuery.isError ? (
                    <div className="space-y-3">
                      <p className="text-sm text-text-secondary">
                        Could not load open times for this date.
                      </p>
                      <Button variant="secondary" onClick={() => slotsQuery.refetch()}>
                        Retry
                      </Button>
                    </div>
                  ) : (
                    <BookingSlotPicker
                      slots={slotsQuery.data ?? []}
                      selectedScheduledAt={selectedSlot?.scheduled_at ?? null}
                      onSelectSlot={handleSelectSlot}
                      slotDurationMinutes={slotDurationMinutes}
                      isLoading={slotsQuery.isFetching}
                      selectedDateLabel={selectedDateLabel}
                    />
                  )}
                </section>
              ) : null}

              {selectedDate && selectedSlot ? (
                <section className="space-y-3 border-t border-border pt-6">
                  <h2 className="text-sm font-medium text-text-primary">Your details</h2>
                  {isLwtpStrategy && bookingOptionsQuery.isError ? (
                    <div className="space-y-3">
                      <p className="text-sm text-text-secondary">
                        Could not load subject options. Try again in a moment.
                      </p>
                      <Button
                        variant="secondary"
                        onClick={() => bookingOptionsQuery.refetch()}
                      >
                        Retry
                      </Button>
                    </div>
                  ) : (
                    <BookingDetailsForm
                      selectedDate={selectedDate}
                      selectedSlot={selectedSlot}
                      consultationStrategy={consultationStrategy}
                      bookingOptions={bookingOptionsQuery.data}
                      onSubmit={(values) => bookingMutation.mutate(values)}
                      isSubmitting={bookingMutation.isPending}
                      errorMessage={bookingError}
                    />
                  )}
                </section>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
