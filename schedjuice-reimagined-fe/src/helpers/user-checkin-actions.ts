import {
  CheckinBlockReason,
  CheckinStatus,
  type OpenCheckinSession,
} from "@/types/attendance";
import { courseStatus } from "@/types/course";

export type UserCheckinActionInput = {
  courseId: string;
  currentStatus: CheckinStatus;
  hasEventsToday: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  totalEvents: number;
  completedEvents: number;
  hasStaleOpenSession: boolean;
  checkinBlockReason: CheckinBlockReason | null;
  checkinBlockMessage?: string | null;
  openCheckinSession: OpenCheckinSession | null | undefined;
  isLoading: boolean;
};

function isSameCourseOpenSession(
  openCheckinSession: OpenCheckinSession,
  courseId: string,
): boolean {
  return String(openCheckinSession.course_id) === String(courseId);
}

function sameCourseNeedsCheckoutBeforeCheckIn(
  status: UserCheckinActionInput,
): boolean {
  if (status.currentStatus !== CheckinStatus.checked_in) {
    return false;
  }
  if (status.hasStaleOpenSession) {
    return true;
  }
  return status.completedEvents < status.totalEvents - 1;
}

export function needsCheckoutBeforeCheckIn(
  status: UserCheckinActionInput,
): boolean {
  const openSession = status.openCheckinSession;
  if (!openSession) {
    return false;
  }

  if (isSameCourseOpenSession(openSession, status.courseId)) {
    return sameCourseNeedsCheckoutBeforeCheckIn(status);
  }

  if (openSession.course_effective_status === courseStatus.ended) {
    return false;
  }

  if (!status.hasEventsToday || status.currentStatus === CheckinStatus.checked_out) {
    return false;
  }

  if (status.currentStatus === CheckinStatus.checked_in) {
    return false;
  }

  return true;
}

export function shouldShowCheckOut(status: UserCheckinActionInput): boolean {
  return status.currentStatus === CheckinStatus.checked_in;
}

export function shouldShowCheckIn(status: UserCheckinActionInput): boolean {
  if (status.currentStatus === CheckinStatus.checked_out) {
    return false;
  }
  if (status.canCheckIn) {
    return true;
  }
  if (needsCheckoutBeforeCheckIn(status)) {
    return true;
  }
  if (status.checkinBlockReason === "checkin_too_early") {
    return true;
  }
  if (status.checkinBlockReason === "checkin_after_event_end") {
    return true;
  }
  if (status.checkinBlockReason === "payroll_rate_missing") {
    return true;
  }
  return false;
}

export function isCheckInDisabled(status: UserCheckinActionInput): boolean {
  if (
    status.isLoading ||
    !status.hasEventsToday ||
    status.currentStatus === CheckinStatus.checked_out
  ) {
    return true;
  }
  if (status.canCheckIn) {
    return false;
  }
  if (needsCheckoutBeforeCheckIn(status)) {
    return false;
  }
  if (status.checkinBlockReason === "checkin_too_early") {
    return true;
  }
  if (status.checkinBlockReason === "checkin_after_event_end") {
    return true;
  }
  if (status.checkinBlockReason === "payroll_rate_missing") {
    return true;
  }
  return !status.canCheckIn;
}

export function isCheckOutDisabled(status: UserCheckinActionInput): boolean {
  return (
    status.isLoading ||
    !status.hasEventsToday ||
    status.currentStatus !== CheckinStatus.checked_in
  );
}

export function getBlockingOpenSession(
  status: UserCheckinActionInput,
): OpenCheckinSession | null {
  if (!needsCheckoutBeforeCheckIn(status) || !status.openCheckinSession) {
    return null;
  }
  return status.openCheckinSession;
}
