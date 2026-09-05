import { axiosClient } from "@/lib/api";
import { type CourseScope, EMPTY_COURSE_SCOPE } from "@/lib/imports/course-scope";

export type UserRef = {
  id: number;
  name: string;
  email: string;
  code: string | null;
  profile_image: string | null;
  roles: string[];
};

export type CourseCandidate = {
  id: number;
  title: string;
  code: string | null;
  academic_year: string | null;
  student_count: number | null;
  score: number;
};

export type CourseResolution = {
  status: "linked" | "needs_attention" | "none";
  match: CourseCandidate | null;
  candidates: CourseCandidate[];
};

export type ParseResult = {
  sheetNames: string[];
  activeSheet: string;
  headers: string[];
  rows: (string | number | null)[][];
  rowCount: number;
};

export async function parseImport(file: File, sheet?: string): Promise<ParseResult> {
  const form = new FormData();
  form.append("file", file);
  if (sheet) form.append("sheet", sheet);
  const res = await axiosClient.post("imports/parse", form);
  const d = res.data?.data ?? {};
  return {
    sheetNames: d.sheet_names ?? [],
    activeSheet: d.active_sheet ?? "",
    headers: d.headers ?? [],
    rows: d.rows ?? [],
    rowCount: d.row_count ?? 0,
  };
}

export async function resolveUsersBulk(
  emails: string[],
): Promise<Record<string, UserRef | null>> {
  if (emails.length === 0) return {};
  const res = await axiosClient.post("users/resolve-bulk", { emails });
  return (res.data?.data ?? {}) as Record<string, UserRef | null>;
}

export type MatchKind = "exact" | "fuzzy" | "none";

export type UserMatchCandidate = {
  user: UserRef;
  score: number;
  field: string;
};

export type UserMatchResult = {
  kind: MatchKind;
  user: UserRef | null;
  field: string | null;
  score: number | null;
  candidates: UserMatchCandidate[];
};

export type MatchSpec = {
  key: string;
  type: "email" | "phone";
  fuzzy: boolean;
  values: string[];
};

export async function matchUsersBulk(
  specs: MatchSpec[],
): Promise<Record<string, Record<string, UserMatchResult>>> {
  const nonEmpty = specs.filter((s) => s.values.length > 0);
  if (nonEmpty.length === 0) return {};
  const res = await axiosClient.post("users/match-bulk", { specs: nonEmpty });
  return (res.data?.data?.results ?? {}) as Record<
    string,
    Record<string, UserMatchResult>
  >;
}

export async function resolveCoursesBulk(
  names: string[],
  scope: CourseScope = EMPTY_COURSE_SCOPE,
): Promise<Record<string, CourseResolution>> {
  if (names.length === 0) return {};
  const res = await axiosClient.post("courses/resolve-bulk", {
    names,
    program_id: scope.programId ?? undefined,
    intake_id: scope.intakeId ?? undefined,
  });
  return (res.data?.data ?? {}) as Record<string, CourseResolution>;
}

export type ImportFieldDef = {
  field_key: string;
  field_label: string;
  field_type: string;
  choices: { value: string; label: string }[] | null;
  validation_rules?: Record<string, unknown> | null;
  source: "identity" | "builtin" | "custom" | "special";
  special: "user" | "course" | null;
  required_for_role: boolean;
};

export async function fetchImportFields(
  role: string,
): Promise<ImportFieldDef[]> {
  const res = await axiosClient.get(
    `imports/fields?entity=users&role=${encodeURIComponent(role)}`,
  );
  return (res.data?.data ?? []) as ImportFieldDef[];
}

export async function createCustomFieldDefinition(body: {
  field_key: string;
  field_label: string;
  field_type: string;
}): Promise<ImportFieldDef> {
  const res = await axiosClient.post("custom-field-definitions", {
    entity_type: "app_auth.User",
    source: "custom",
    required_at: "never",
    filled_by: "both",
    roles: [],
    ...body,
  });
  const d = res.data?.data ?? {};
  return {
    field_key: d.field_key,
    field_label: d.field_label,
    field_type: d.field_type,
    choices: d.choices ?? null,
    validation_rules: d.validation_rules ?? null,
    source: "custom",
    special: null,
    required_for_role: false,
  };
}

export type CommitRow = {
  email: string;
  name?: string;
  phone_number?: string;
  communication_email?: string;
  date_of_birth?: string;
  match_user_id?: number;
  custom_data: Record<string, unknown>;
  course_ids: number[];
};

export type CommitResult = {
  created: number;
  updated: number;
  enrolled: number;
  microsoft_job_id?: number | null;
};

export type ImportMicrosoftJob = {
  id: number;
  status: "pending" | "running" | "succeeded" | "partial" | "failed";
  succeeded: number;
  failed: number;
  skipped: number;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
};

export type CommitError = { row: number; field: string; reason: string };

export async function commitImport(
  role: string,
  rows: CommitRow[],
  duplicateStrategy: "keep_first" | "keep_last" | "merge" = "keep_first",
  sendWelcomeEmails = false,
): Promise<CommitResult> {
  const res = await axiosClient.post("imports/commit", {
    role,
    rows,
    duplicate_strategy: duplicateStrategy,
    send_welcome_emails: sendWelcomeEmails,
  });
  return (res.data?.data ?? {}) as CommitResult;
}

export async function getImportMicrosoftJob(
  jobId: number | string,
): Promise<ImportMicrosoftJob> {
  const res = await axiosClient.get(`imports/microsoft-jobs/${jobId}`);
  return (res.data?.data ?? {}) as ImportMicrosoftJob;
}
