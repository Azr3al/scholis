import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/hooks/useUser";
import {
  createParentComplaint,
  fetchIssue,
  fetchIssueTimeline,
  fetchIssues,
  moveIssue,
  postComplaintComment,
} from "@/lib/issues-api";
import {
  rememberOpenStatusId,
  resolveOpenStatusIdFromIssues,
} from "@/lib/complaints/complaint-status";
import type { ChatAttachmentRef } from "@/types/chat";
import type { Issue } from "@/types/issue";

export const complaintsKeys = {
  list: ["complaints", "list"] as const,
  detail: (id: number) => ["complaints", "detail", id] as const,
  timeline: (id: number) => ["complaints", "timeline", id] as const,
  openStatusId: ["complaints", "open-status-id"] as const,
};

const TIMELINE_POLL_MS = 20_000;

function useComplaintsQueriesEnabled() {
  const { user, isLoading } = useUser(false);
  return !isLoading && Boolean(user);
}

function cacheOpenStatusId(
  queryClient: ReturnType<typeof useQueryClient>,
  status: Issue["status"],
) {
  const openId =
    typeof status === "object" ? rememberOpenStatusId(status) : undefined;
  if (openId != null) {
    queryClient.setQueryData(complaintsKeys.openStatusId, openId);
  }
}

export function useComplaints() {
  const enabled = useComplaintsQueriesEnabled();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: complaintsKeys.list,
    queryFn: async () => {
      const issues = await fetchIssues();
      const openId = resolveOpenStatusIdFromIssues(issues);
      if (openId != null) {
        queryClient.setQueryData(complaintsKeys.openStatusId, openId);
      }
      return issues;
    },
    enabled,
  });
}

export function useComplaint(issueId: number) {
  const enabled = useComplaintsQueriesEnabled();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: complaintsKeys.detail(issueId),
    queryFn: async () => {
      const issue = await fetchIssue(issueId);
      cacheOpenStatusId(queryClient, issue.status);
      return issue;
    },
    enabled: enabled && Number.isFinite(issueId),
  });
}

export function useComplaintTimeline(issueId: number) {
  const enabled = useComplaintsQueriesEnabled();

  return useQuery({
    queryKey: complaintsKeys.timeline(issueId),
    queryFn: () => fetchIssueTimeline(issueId),
    enabled: enabled && Number.isFinite(issueId),
    refetchInterval: TIMELINE_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

export function useCreateComplaint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      body?: string;
      attachments?: ChatAttachmentRef[];
      is_anonymous?: boolean;
    }) => createParentComplaint(input),
    onSuccess: (issue) => {
      cacheOpenStatusId(queryClient, issue.status);
      queryClient.invalidateQueries({ queryKey: complaintsKeys.list });
    },
  });
}

export function usePostComplaintComment(issueId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { body?: string; attachments?: ChatAttachmentRef[] }) =>
      postComplaintComment(issueId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: complaintsKeys.timeline(issueId) }),
        queryClient.invalidateQueries({ queryKey: complaintsKeys.list }),
        queryClient.invalidateQueries({ queryKey: complaintsKeys.detail(issueId) }),
      ]);
    },
  });
}

export function useReopenComplaint(issueId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (openStatusId: number) => moveIssue(issueId, openStatusId),
    onSuccess: (issue) => {
      cacheOpenStatusId(queryClient, issue.status);
      queryClient.invalidateQueries({ queryKey: complaintsKeys.list });
      queryClient.invalidateQueries({ queryKey: complaintsKeys.detail(issueId) });
      queryClient.invalidateQueries({ queryKey: complaintsKeys.timeline(issueId) });
    },
  });
}
