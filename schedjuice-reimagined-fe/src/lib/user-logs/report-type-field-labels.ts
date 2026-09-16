import type { ReportFieldType } from "@/types/user-log";

export const REPORT_TYPE_FIELD_LABELS: Record<ReportFieldType, string> = {
  text: "Text",
  textarea: "Paragraph",
  number: "Number",
  date: "Date",
  datetime: "Date & time",
  boolean: "Yes / No",
  choice: "Single choice",
  multichoice: "Multi choice",
  email: "Email",
  url: "Link",
  staff_user_fk: "Staff user",
  course_fk: "Course",
};
