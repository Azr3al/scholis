export enum CancelCheckinReason {
  StudentNoShow = "student_no_show",
  CheckedInByMistake = "checked_in_by_mistake",
  Other = "other",
}

export const CANCEL_CHECKIN_REASON_CODES = [
  CancelCheckinReason.StudentNoShow,
  CancelCheckinReason.CheckedInByMistake,
  CancelCheckinReason.Other,
] as const;

export const CANCEL_CHECKIN_NOTE_MAX_LENGTH = 500;

export function canCancelTeacherCheckin(
  tenant: { allow_teacher_checkin_cancellation?: boolean } | null | undefined,
): boolean {
  return Boolean(tenant?.allow_teacher_checkin_cancellation);
}

export function isCancelCheckinReasonCode(value: string): value is CancelCheckinReason {
  return (CANCEL_CHECKIN_REASON_CODES as readonly string[]).includes(value);
}

export function isCancelCheckinSubmitEnabled(reasonCode: string, note: string): boolean {
  if (!isCancelCheckinReasonCode(reasonCode)) {
    return false;
  }
  const trimmedNote = note.trim();
  if (reasonCode === CancelCheckinReason.Other && trimmedNote.length === 0) {
    return false;
  }
  if (trimmedNote.length > CANCEL_CHECKIN_NOTE_MAX_LENGTH) {
    return false;
  }
  return true;
}

export function normalizeCancelCheckinNote(note: string): string | undefined {
  const trimmed = note.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function cancelCheckinReasonLabel(reason: CancelCheckinReason): string {
  if (reason === CancelCheckinReason.StudentNoShow) {
    return "Student did not show up";
  }
  if (reason === CancelCheckinReason.CheckedInByMistake) {
    return "Checked in by mistake";
  }
  return "Other";
}
