export type AppliesTo = "STUDENT" | "STAFF" | "BOTH";

export type ReportFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "datetime"
  | "boolean"
  | "choice"
  | "multichoice"
  | "email"
  | "url"
  | "staff_user_fk"
  | "course_fk";

export type FieldChoice = { value: string; label: string };

export interface ReportTypeField {
  id: number;
  report_type: number;
  field_key: string;
  field_label: string;
  field_type: ReportFieldType;
  is_required: boolean;
  choices: FieldChoice[] | null;
  validation_rules: Record<string, unknown> | null;
  sort_order: number;
}

export interface ReportType {
  id: number;
  name: string;
  description: string;
  color: string;
  applies_to: AppliesTo;
  is_active: boolean;
  order: number;
  fields?: ReportTypeField[];
}

export interface UserMini {
  id: number;
  name: string;
  email: string;
}

export interface LogAttachment {
  id: number;
  filename: string;
  is_image: boolean;
  file_type: string | null;
  size: number | null;
}

export interface LogEntry {
  id: number;
  subject: number | UserMini;
  report_type: number | ReportType;
  title: string;
  body: string;
  field_values: Record<string, unknown>;
  field_values_display: Record<string, unknown>;
  attachments: LogAttachment[];
  author: number | UserMini | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export type AuditLevel = "MAJOR" | "DETAIL";

export interface LogTimelineEvent {
  id: number;
  event_type: "created" | "edited" | "deleted";
  level: AuditLevel;
  payload: Record<string, unknown>;
  actor: UserMini | null;
  created_at: string;
}

export interface LogVersion {
  id: number;
  version_no: number;
  editor: UserMini | null;
  snapshot: Record<string, unknown>;
  change_summary: string;
  created_at: string;
}
