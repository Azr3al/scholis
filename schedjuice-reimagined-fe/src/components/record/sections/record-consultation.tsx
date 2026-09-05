"use client";

import { BookingLinkCard } from "@/components/consultation/booking-link-card";
import { ConsultationBookingsList } from "@/components/consultation/consultation-bookings-list";
import { GoogleCalendarConnectorRow } from "@/components/consultation/google-calendar-connector-row";
import { WhitelistEditor } from "@/components/consultation/whitelist-editor";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/misc/accordion";
import { RecordSection } from "@/components/record/record-section";
import { restoreMainContentViewportAnchor } from "@/lib/main-content-scroll";
import {
  canCancelConsultationBooking,
  canManageConsultationSchedule,
  canViewConsultationBookings,
} from "@/lib/consultation/visibility";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";
import { useLayoutEffect, useRef, useState } from "react";

const WEEKLY_AVAILABILITY_ITEM = "weekly-availability";

export function RecordConsultation({
  subject,
  viewer,
  tenant,
}: {
  subject: accountType;
  viewer: accountType;
  tenant: organizationType | null;
}) {
  const showBookings = canViewConsultationBookings(viewer);
  const canEditSchedule = canManageConsultationSchedule(viewer);
  const canCancel = canCancelConsultationBooking(viewer);

  const [accordionValue, setAccordionValue] = useState<string[]>([]);
  const weeklyAvailabilityRef = useRef<HTMLDivElement>(null);
  const expandedAnchorTopRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (accordionValue.includes(WEEKLY_AVAILABILITY_ITEM)) return;
    if (expandedAnchorTopRef.current == null) return;
    if (!weeklyAvailabilityRef.current) return;

    restoreMainContentViewportAnchor(
      expandedAnchorTopRef.current,
      weeklyAvailabilityRef.current,
    );
    expandedAnchorTopRef.current = null;
  }, [accordionValue]);

  function handleAccordionValueChange(next: string[]) {
    const isOpening =
      !accordionValue.includes(WEEKLY_AVAILABILITY_ITEM) &&
      next.includes(WEEKLY_AVAILABILITY_ITEM);

    if (isOpening && weeklyAvailabilityRef.current) {
      expandedAnchorTopRef.current =
        weeklyAvailabilityRef.current.getBoundingClientRect().top;
    }

    setAccordionValue(next);
  }

  return (
    <div className="flex flex-col gap-8">
      {showBookings ? (
        <RecordSection title="My bookings" description="Upcoming and past sessions.">
          <ConsultationBookingsList tenant={tenant} canManage={canCancel} />
        </RecordSection>
      ) : null}

      <RecordSection
        title="Booking link"
        description="Your public link for student consultation bookings."
      >
        <BookingLinkCard />
      </RecordSection>

      {tenant?.is_google_on && tenant?.is_consultation_booking_on ? (
        <RecordSection
          title="Google Calendar"
          description="Required so open times stay in sync with your calendar."
        >
          <GoogleCalendarConnectorRow
            user={subject}
            viewerAccount={viewer}
            tenant={tenant}
          />
        </RecordSection>
      ) : null}

      {canEditSchedule ? (
        <div ref={weeklyAvailabilityRef}>
          <Accordion
            value={accordionValue}
            // SAFETY: runtime-narrowed value matches the declared TypeScript contract after boundary checks.
            onValueChange={(value) =>
              handleAccordionValueChange(value as string[])
            }
            className="border-none"
          >
            <AccordionItem value={WEEKLY_AVAILABILITY_ITEM} className="border-none">
              <AccordionTrigger className="items-start gap-3 py-0 hover:no-underline [&>svg]:mt-1.5">
                <div className="flex flex-col items-start gap-1 text-left">
                  <h2 className="font-serif text-xl text-text-primary">
                    Weekly availability
                  </h2>
                  <p className="text-sm font-normal text-text-muted">
                    Times when students can book a consultation.
                  </p>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-3">
                <WhitelistEditor />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      ) : null}
    </div>
  );
}
