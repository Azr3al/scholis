import { format } from "date-fns";
import { EXAM_BOARD_OPTIONS, type ExamBoardType } from "@/types/course";
import { ConsultationClassPreference } from "@/types/consultation";

export const LWTP_STRATEGY = "lwtp";

export const CLASS_PREFERENCE_OPTIONS = [
  {
    value: ConsultationClassPreference.PremiumOneOnOne,
    label: "Premium one on one special class",
  },
  {
    value: ConsultationClassPreference.GroupClass,
    label: "Group class",
  },
  {
    value: ConsultationClassPreference.BothOk,
    label: "Both is ok",
  },
] as const;

export const DEFAULT_PHONE_DIAL_CODE = "+95";

const CLASS_PREFERENCE_LABELS: Record<ConsultationClassPreference, string> = {
  [ConsultationClassPreference.PremiumOneOnOne]:
    "Premium one on one special class",
  [ConsultationClassPreference.GroupClass]: "Group class",
  [ConsultationClassPreference.BothOk]: "Both is ok",
};

export type LwtpBookingDetailsPayload = {
  myanmar_name: string;
  class_preference: ConsultationClassPreference;
  exam_board: ExamBoardType;
  subject_ids: number[];
  phone?: string;
  telegram_username?: string;
  exam_target?: string;
  subject_other?: string;
};

export type LwtpBookingFormValues = {
  student_name: string;
  student_email: string;
  myanmar_name: string;
  class_preference: string;
  phoneDialCode: string;
  phoneNumber: string;
  telegram_username: string;
  examTargetDate: Date | undefined;
  exam_board: string;
  subjectIds: number[];
  subjectOtherChecked: boolean;
  subject_other: string;
};

export function formatExamTargetForSubmit(date: Date | undefined): string {
  if (!date) return "";
  return format(new Date(date.getFullYear(), date.getMonth(), 1), "MMMM yyyy");
}

export function formatClassPreferenceLabel(value: string | undefined): string {
  if (!value) return "";
  return (
    CLASS_PREFERENCE_LABELS[value as ConsultationClassPreference] ??
    value.replaceAll("_", " ")
  );
}

export function formatPhoneForSubmit(dialCode: string, phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  if (!digits) return "";
  const code = dialCode.trim() || DEFAULT_PHONE_DIAL_CODE;
  const normalizedCode = code.startsWith("+") ? code : `+${code}`;
  return `${normalizedCode}${digits}`;
}

export function validateLwtpBookingForm(values: LwtpBookingFormValues): string | null {
  if (!values.student_name.trim()) {
    return "Name is required.";
  }
  if (!values.student_email.trim()) {
    return "Email is required.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.student_email.trim())) {
    return "Enter a valid email address.";
  }
  if (!values.myanmar_name.trim()) {
    return "Myanmar name is required.";
  }
  if (!values.class_preference) {
    return "Select a class preference.";
  }
  if (
    !CLASS_PREFERENCE_OPTIONS.some((option) => option.value === values.class_preference)
  ) {
    return "Select a valid class preference.";
  }
  if (!values.exam_board) {
    return "Select an exam board.";
  }
  if (!EXAM_BOARD_OPTIONS.includes(values.exam_board as ExamBoardType)) {
    return "Select a valid exam board.";
  }
  if (values.subjectIds.length === 0 && !values.subjectOtherChecked) {
    return "Select at least one subject or choose Other.";
  }
  if (values.subjectOtherChecked && !values.subject_other.trim()) {
    return "Describe the other subject.";
  }
  return null;
}

export function buildLwtpBookingDetails(
  values: LwtpBookingFormValues,
): LwtpBookingDetailsPayload {
  const phone = formatPhoneForSubmit(values.phoneDialCode, values.phoneNumber);
  const telegram = values.telegram_username.trim().replace(/^@/, "");

  const details: LwtpBookingDetailsPayload = {
    myanmar_name: values.myanmar_name.trim(),
    class_preference: values.class_preference as ConsultationClassPreference,
    exam_board: values.exam_board as ExamBoardType,
    subject_ids: values.subjectIds,
  };

  if (phone) {
    details.phone = phone;
  }
  if (telegram) {
    details.telegram_username = telegram;
  }
  const examTarget = formatExamTargetForSubmit(values.examTargetDate);
  if (examTarget) {
    details.exam_target = examTarget;
  }
  if (values.subjectOtherChecked) {
    details.subject_other = values.subject_other.trim();
  }

  return details;
}

export function formatLwtpBookingDetailRows(
  details: Record<string, unknown> | null | undefined,
): Array<{ label: string; value: string }> {
  if (!details || details.strategy !== LWTP_STRATEGY) {
    return [];
  }

  const rows: Array<{ label: string; value: string }> = [];

  if (typeof details.myanmar_name === "string" && details.myanmar_name) {
    rows.push({ label: "Myanmar name", value: details.myanmar_name });
  }

  if (typeof details.class_preference === "string" && details.class_preference) {
    rows.push({
      label: "Class preference",
      value: formatClassPreferenceLabel(details.class_preference),
    });
  }

  if (typeof details.exam_board === "string" && details.exam_board) {
    rows.push({ label: "Exam board", value: details.exam_board });
  }

  const subjectNames = Array.isArray(details.subject_names)
    ? details.subject_names.filter((name): name is string => typeof name === "string")
    : [];
  const subjectParts = [...subjectNames];
  if (typeof details.subject_other === "string" && details.subject_other) {
    subjectParts.push(`Other: ${details.subject_other}`);
  }
  if (subjectParts.length > 0) {
    rows.push({ label: "Subjects", value: subjectParts.join(", ") });
  }

  if (typeof details.exam_target === "string" && details.exam_target) {
    rows.push({ label: "Exam target", value: details.exam_target });
  }

  if (typeof details.phone === "string" && details.phone) {
    rows.push({ label: "Phone", value: details.phone });
  }

  if (typeof details.telegram_username === "string" && details.telegram_username) {
    rows.push({ label: "Telegram", value: `@${details.telegram_username}` });
  }

  return rows;
}
