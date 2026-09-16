"use client";

import type { LeadAppointment, LeadUserMini, TimelineItem } from "@/types/lead";
import {
  UserSummaryInlineHover,
  type UserSummary,
} from "@/components/users/user-summary-card";
import {
  isGoogleMeetLink,
  isTeamsMeeting,
  isZoomMeeting,
  meetingPlatformIcon,
} from "@/helpers/discriminate-meeting-link";
import { Activity, MessageText as MessageSquare } from "iconoir-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { staggerItem, staggerItemOpacity, staggerList } from "@/lib/sj/motion";
import { AppointmentDetailPanel } from "./appointment-detail-panel";
import {
  APPOINTMENT_PLATFORM_LABELS,
  appointmentPlatformDisplay,
} from "./appointment-platform-display";
import { MeetingPlatformBadge } from "./meeting-platform-badge";

const APPOINTMENT_EVENT_TYPES = new Set([
  "appointment_booked",
  "appointment_rescheduled",
  "appointment_no_show",
]);

const PLATFORM_LABELS = APPOINTMENT_PLATFORM_LABELS;

const EVENT_LABEL: Record<string, (payload: Record<string, unknown>) => string> = {
  created: () => "created this lead",
  status_changed: (payload) =>
    `moved ${payload.from ?? "—"} → ${payload.to ?? "—"}`,
  appointment_rescheduled: () => "rescheduled the appointment",
  appointment_no_show: () => "marked appointment as no-show",
  assignee_changed: () => "changed the assignee",
  converted: () => "converted this lead to a student",
};

function platformLabelFromLink(link: string): string | null {
  if (isZoomMeeting(link)) return "Zoom";
  if (isTeamsMeeting(link)) return "Microsoft Teams";
  if (isGoogleMeetLink(link)) return "Google Meet";
  return null;
}

function meetingPlatformDisplay(
  appointment: LeadAppointment | null,
  payload: Record<string, unknown>,
) {
  if (appointment) {
    return appointmentPlatformDisplay(appointment);
  }

  const link = "";
  const platform = String(payload.platform ?? "");
  const icon = meetingPlatformIcon(link, platform);
  const label =
    (platformLabelFromLink(link) ?? PLATFORM_LABELS[platform] ?? platform) ||
    "appointment";

  return { icon, label };
}

function AppointmentBookedLabel({
  appointment,
  payload,
}: {
  appointment: LeadAppointment | null;
  payload: Record<string, unknown>;
}) {
  const { icon, label } = meetingPlatformDisplay(appointment, payload);

  return (
    <span className="text-text-secondary">
      booked an appointment{" "}
      <span className="inline-flex items-center gap-1 align-middle">
        (
        <MeetingPlatformBadge icon={icon} label={label} />)
      </span>
    </span>
  );
}

function resolveAppointmentForEvent(
  event: Extract<TimelineItem, { kind: "event" }>,
  appointments: LeadAppointment[],
): LeadAppointment | null {
  const payload = event.payload;
  const appointmentId = payload.appointment_id;
  if (typeof appointmentId === "number") {
    return appointments.find((item) => item.id === appointmentId) ?? null;
  }

  const scheduledAt = payload.scheduled_at;
  if (typeof scheduledAt === "string") {
    const target = new Date(scheduledAt).getTime();
    return (
      appointments.find(
        (item) => new Date(item.scheduled_at).getTime() === target,
      ) ?? null
    );
  }

  if (appointments.length === 1) {
    return appointments[0];
  }

  return null;
}

function ActorName({ actor }: { actor: LeadUserMini | null }) {
  if (!actor) {
    return <span className="font-medium text-text-secondary">Someone</span>;
  }

  const user: UserSummary = {
    id: actor.id,
    name: actor.name,
    email: actor.email,
  };

  return (
    <UserSummaryInlineHover user={user}>
      <span className="cursor-default rounded-sm font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline">
        {actor.name}
      </span>
    </UserSummaryInlineHover>
  );
}

export function LeadTimeline({
  items,
  appointments = [],
  selectedEventId,
  onSelectEvent,
  onAppointmentSaved,
}: {
  items: TimelineItem[];
  appointments?: LeadAppointment[];
  selectedEventId?: number | null;
  onSelectEvent?: (eventId: number | null) => void;
  onAppointmentSaved?: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const itemVariants = reducedMotion ? staggerItemOpacity : staggerItem;

  if (!items.length) {
    return <p className="text-sm text-text-muted">No activity yet.</p>;
  }

  return (
    <motion.ol
      variants={staggerList}
      initial="hidden"
      animate="show"
    >
      {items.map((item, index) => {
        const isAppointmentEvent =
          item.kind === "event" && APPOINTMENT_EVENT_TYPES.has(item.event_type);
        const isSelected =
          item.kind === "event" && selectedEventId === item.id;
        const eventAppointment =
          item.kind === "event" && isAppointmentEvent
            ? resolveAppointmentForEvent(item, appointments)
            : null;
        const resolvedAppointment = isSelected ? eventAppointment : null;

        return (
          <motion.li
            key={`${item.kind}-${item.id}`}
            variants={itemVariants}
            className="relative flex gap-3 pb-4 text-sm last:pb-0"
          >
            {index < items.length - 1 && (
              <span
                className="absolute left-[7px] top-5 h-[calc(100%-0.5rem)] w-px bg-border"
                aria-hidden
              />
            )}
            <span className="relative z-10 mt-0.5 flex h-4 w-4 items-center justify-center bg-surface-elevated text-text-muted">
              {item.kind === "comment" ? (
                <MessageSquare className="h-4 w-4" />
              ) : (
                <Activity className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              {isAppointmentEvent ? (
                <button
                  type="button"
                  onClick={() =>
                    onSelectEvent?.(isSelected ? null : item.id)
                  }
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-left transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quiet)]",
                    isSelected
                      ? "bg-accent/5 ring-1 ring-accent/20"
                      : "hover:bg-surface-hover",
                  )}
                >
                  <ActorName actor={item.actor} />{" "}
                  {item.event_type === "appointment_booked" ? (
                    <AppointmentBookedLabel
                      appointment={eventAppointment}
                      payload={item.payload}
                    />
                  ) : (
                    <span className="text-text-secondary">
                      {(EVENT_LABEL[item.event_type] ?? ((type) => type))(
                        item.payload,
                      )}
                    </span>
                  )}
                  <div className="font-mono text-xs text-text-muted">
                    {new Date(item.created_at).toLocaleString()}
                  </div>
                </button>
              ) : (
                <div>
                  <ActorName actor={item.actor} />{" "}
                  {item.kind === "comment" ? (
                    <span className="text-text-primary">{item.body}</span>
                  ) : (
                    <span className="text-text-secondary">
                      {(EVENT_LABEL[item.event_type] ?? ((type) => type))(
                        item.payload,
                      )}
                    </span>
                  )}
                  <div className="font-mono text-xs text-text-muted">
                    {new Date(item.created_at).toLocaleString()}
                  </div>
                </div>
              )}

              {resolvedAppointment ? (
                <AppointmentDetailPanel
                  appointment={resolvedAppointment}
                  onSaved={() => onAppointmentSaved?.()}
                />
              ) : isAppointmentEvent && isSelected ? (
                <p className="mt-2 text-xs text-text-muted">
                  Appointment details are not available for this event.
                </p>
              ) : null}
            </div>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}
