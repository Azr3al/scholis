import { axiosClient } from "@/lib/api";

/**
 * Microsoft provisioning reliability API client: per-record recovery + linking
 * for users/courses, and Superadmin Tools bulk repair + health.
 */

export type MicrosoftRepairTargetType =
  | "users"
  | "courses"
  | "unlicensed_users"
  | "scope_team_owners";

export type MicrosoftCandidate = {
  id: number;
  status: string;
  detail: string;
  email?: string;
  name?: string;
  title?: string;
  course_id?: number;
  course_title?: string;
  candidate_key?: string;
  microsoft_id?: string | null;
  microsoft_group_id?: string | null;
};

export type MicrosoftCandidateSummary = {
  total: number;
  repairable: number;
  by_status: Record<string, number>;
};

export type MicrosoftRepairJob = {
  id: number;
  target_type: MicrosoftRepairTargetType;
  status: "pending" | "running" | "succeeded" | "partial" | "failed";
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  candidate_ids: number[];
  created_by: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  results?: { id: number; status: string; detail: string }[];
};

// --- Per-record recovery / linking ---------------------------------------

export const createUserMicrosoftAccount = (
  userId: number | string,
  opts?: { allowUnlicensed?: boolean },
) =>
  axiosClient.post(`users/${userId}/create-microsoft-account`, {
    allow_unlicensed: opts?.allowUnlicensed ?? false,
  });

export type MicrosoftUserSuggestion = {
  microsoft_id: string;
  display_name: string;
  user_principal_name: string;
  mail: string;
  match_type: "exact_email" | "search";
};

export const getMicrosoftUserSuggestions = (
  userId: number | string,
  q?: string,
) =>
  axiosClient.get(`users/${userId}/microsoft-suggestions`, {
    params: q ? { q } : undefined,
  });

export const linkUserMicrosoftAccount = (
  userId: number | string,
  identifier: string,
) => axiosClient.post(`users/${userId}/link-microsoft-account`, { identifier });

export const createCourseMicrosoftTeam = (courseId: number | string) =>
  axiosClient.post(`courses/${courseId}/create-microsoft-team`, {});

export const linkCourseMicrosoftTeam = (
  courseId: number | string,
  groupId: string,
) => axiosClient.post(`courses/${courseId}/link-microsoft-team`, { group_id: groupId });

export type MicrosoftChannel = {
  id: string;
  displayName: string;
};

export const getCourseMicrosoftChannels = (courseId: number | string) =>
  axiosClient.get<{ data: MicrosoftChannel[] }>(
    `courses/${courseId}/microsoft-channels`,
  );

export const resendAnnouncementToTeams = (announcementId: number | string) =>
  axiosClient.post(`announcements/${announcementId}/resend-to-teams`, {}, {
    timeout: 60_000,
  });

export type PersonalMicrosoftStatus = {
  connected: boolean;
  status: string | null;
  authorized_upn: string;
  authorized_display_name: string;
};

export type ServiceMicrosoftStatus = {
  connected: boolean;
  status: string | null;
  authorized_upn: string;
};

export const startPersonalMicrosoftOAuth = (opts?: { returnPath?: string }) =>
  axiosClient.get<{ authorize_url: string }>(`microsoft/oauth/start/personal`, {
    params: opts?.returnPath ? { return_path: opts.returnPath } : undefined,
  });

export const reconnectPersonalMicrosoftOAuth = (opts?: { returnPath?: string }) =>
  axiosClient.post<{ authorize_url: string }>(
    `microsoft/oauth/personal/reconnect`,
    opts?.returnPath ? { return_path: opts.returnPath } : {},
  );

export const disconnectPersonalMicrosoftOAuth = () =>
  axiosClient.post<{ data: { status: string; connected: boolean } }>(
    `microsoft/oauth/personal/disconnect`,
    {},
  );

export const fetchPersonalMicrosoftStatus = () =>
  axiosClient.get<{ data: PersonalMicrosoftStatus }>(
    `microsoft/oauth/personal/status`,
  );

export const startServiceMicrosoftOAuth = (opts?: {
  organizationId?: number | string;
  returnPath?: string;
}) =>
  axiosClient.get<{ authorize_url: string }>(
    `microsoft/oauth/start/service-account`,
    {
      params: {
        ...(opts?.organizationId != null
          ? { organization_id: opts.organizationId }
          : {}),
        ...(opts?.returnPath ? { return_path: opts.returnPath } : {}),
      },
    },
  );

export const reconnectServiceMicrosoftOAuth = (opts?: {
  organizationId?: number | string;
  returnPath?: string;
}) =>
  axiosClient.post<{ authorize_url: string }>(
    `microsoft/oauth/service-account/reconnect`,
    {
      ...(opts?.organizationId != null
        ? { organization_id: opts.organizationId }
        : {}),
      ...(opts?.returnPath ? { return_path: opts.returnPath } : {}),
    },
  );

export const disconnectServiceMicrosoftOAuth = (
  organizationId?: number | string,
) =>
  axiosClient.post<{ data: { status: string; connected: boolean } }>(
    `microsoft/oauth/service-account/disconnect`,
    organizationId != null ? { organization_id: organizationId } : {},
  );

export const fetchServiceMicrosoftStatus = (
  organizationId?: number | string,
) =>
  axiosClient.get<{ data: ServiceMicrosoftStatus }>(
    `microsoft/oauth/service-account/status`,
    {
      params:
        organizationId != null
          ? { organization_id: organizationId }
          : undefined,
    },
  );

// --- Superadmin Tools: bulk repair + health -------------------------------

export const microsoftRepairDryRun = (
  target_type: MicrosoftRepairTargetType,
  organizationId: number | string,
) =>
  axiosClient.post(`microsoft/repair/dry-run`, {
    target_type,
    organization_id: organizationId,
  });

export const startMicrosoftRepairJob = (
  target_type: MicrosoftRepairTargetType,
  organizationId: number | string,
  candidate_ids: number[] = [],
) =>
  axiosClient.post(`microsoft/repair/jobs`, {
    target_type,
    organization_id: organizationId,
    candidate_ids,
  });

export const listMicrosoftRepairJobs = (
  organizationId: number | string,
  limit = 20,
) =>
  axiosClient.get(`microsoft/repair/jobs`, {
    params: { organization_id: organizationId, limit },
  });

export const getMicrosoftRepairJob = (
  jobId: number | string,
  organizationId: number | string,
) =>
  axiosClient.get(`microsoft/repair/jobs/${jobId}`, {
    params: { organization_id: organizationId },
  });

export const getMicrosoftHealth = (organizationId: number | string) =>
  axiosClient.get(`microsoft/health`, {
    params: { organization_id: organizationId },
  });

export type MicrosoftPasswordResetPreviewStatus =
  | "eligible"
  | "not_found"
  | "no_microsoft_account";

export type MicrosoftPasswordResetPreviewRow = {
  email: string;
  status: MicrosoftPasswordResetPreviewStatus;
  user_id?: number;
};

export type MicrosoftPasswordResetPreviewSummary = {
  total: number;
  eligible: number;
  not_found: number;
  no_microsoft_account: number;
};

export type MicrosoftPasswordResetCommitStatus =
  | "succeeded"
  | "skipped"
  | "failed";

export type MicrosoftPasswordResetCommitRow = {
  email: string;
  status: MicrosoftPasswordResetCommitStatus;
  reason?: string;
};

export type MicrosoftPasswordResetCommitSummary = {
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
};

export const microsoftPasswordResetPreview = (
  emails: string[],
  organizationId: number | string,
) =>
  axiosClient.post<{
    data: {
      results: MicrosoftPasswordResetPreviewRow[];
      summary: MicrosoftPasswordResetPreviewSummary;
    };
  }>("microsoft/password-reset/preview", {
    emails,
    organization_id: organizationId,
  });

export const microsoftPasswordResetCommit = (
  emails: string[],
  organizationId: number | string,
  password?: string,
) =>
  axiosClient.post<{
    data: {
      results: MicrosoftPasswordResetCommitRow[];
      summary: MicrosoftPasswordResetCommitSummary;
    };
  }>("microsoft/password-reset/commit", {
    emails,
    organization_id: organizationId,
    ...(password != null && password !== "" ? { password } : {}),
  });

export type MicrosoftPasswordResetJob = {
  id: number;
  status: "pending" | "running" | "succeeded" | "partial" | "failed";
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results:
    | ({ email: string; status: string; reason?: string }[])
    | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export const startMicrosoftPasswordResetJob = (
  emails: string[],
  organizationId: number | string,
  password?: string,
) =>
  axiosClient.post<{ data: MicrosoftPasswordResetJob }>(
    "microsoft/password-reset/jobs",
    {
      emails,
      organization_id: organizationId,
      ...(password != null && password !== "" ? { password } : {}),
    },
  );

export const getMicrosoftPasswordResetJob = (
  jobId: number | string,
  organizationId: number | string,
) =>
  axiosClient.get<{ data: MicrosoftPasswordResetJob }>(
    `microsoft/password-reset/jobs/${jobId}`,
    { params: { organization_id: organizationId } },
  );

export const cancelMicrosoftPasswordResetJob = (
  jobId: number | string,
  organizationId: number | string,
) =>
  axiosClient.post<{ data: MicrosoftPasswordResetJob }>(
    `microsoft/password-reset/jobs/${jobId}/cancel`,
    { organization_id: organizationId },
  );
