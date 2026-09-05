import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/hooks/useUser";
import {
  fetchIssues,
  fetchIssueStatuses,
  fetchIssueMentionCandidates,
  moveIssue,
  postIssueComment,
  addIssueObserver,
  removeIssueObserver,
  updateIssue,
  type PostIssueCommentInput,
  type UpdateIssueInput,
} from "@/lib/issues-api";
import { applyOptimisticMove } from "@/lib/kanban-board";
import type { Issue, IssueSource } from "@/types/issue";

export const issuesKeys = {
  issuesListRoot: ["issues", "list"] as const,
  issuesList: (source?: IssueSource) =>
    [...issuesKeys.issuesListRoot, source ?? "all"] as const,
  statuses: ["issues", "statuses"] as const,
  timeline: (id: number) => ["issues", "timeline", id] as const,
  mentionCandidates: (search = "") => ["issues", "mention-candidates", search.trim()] as const,
};

function useIssueBoardQueriesEnabled() {
  const { user, isLoading } = useUser(false);
  return !isLoading && Boolean(user);
}

export function useIssueStatuses() {
  const enabled = useIssueBoardQueriesEnabled();
  return useQuery({
    queryKey: issuesKeys.statuses,
    queryFn: fetchIssueStatuses,
    enabled,
  });
}

export function useIssues(source?: IssueSource) {
  const enabled = useIssueBoardQueriesEnabled();
  return useQuery({
    queryKey: issuesKeys.issuesList(source),
    queryFn: () => fetchIssues(source ? { source } : undefined),
    enabled,
  });
}

export function useMoveIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { issueId: number; statusId: number }) =>
      moveIssue(vars.issueId, vars.statusId),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: issuesKeys.issuesListRoot });
      const previous = queryClient.getQueryData<Issue[]>(
        issuesKeys.issuesList(),
      );
      if (previous) {
        queryClient.setQueryData<Issue[]>(
          issuesKeys.issuesList(),
          applyOptimisticMove(previous, vars.issueId, (issue) => ({
            ...issue,
            status:
              typeof issue.status === "number"
                ? vars.statusId
                : { ...issue.status, id: vars.statusId },
          })),
        );
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(issuesKeys.issuesList(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: issuesKeys.issuesListRoot });
    },
  });
}

export function useUpdateIssue(issueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateIssueInput) => updateIssue(issueId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: issuesKeys.issuesListRoot }),
        queryClient.refetchQueries({
          queryKey: issuesKeys.timeline(issueId),
          type: "active",
        }),
      ]);
    },
  });
}

/** Board-view roster for the shared mention composer / observers picker (all users with `issue.view`). */
export function useIssueMentionCandidates(search = "") {
  const normalized = search.trim();
  return useQuery({
    queryKey: issuesKeys.mentionCandidates(normalized),
    queryFn: () => fetchIssueMentionCandidates(normalized || undefined),
    staleTime: normalized ? 10_000 : 60_000,
  });
}

export function useAddIssueComment(issueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PostIssueCommentInput) => postIssueComment(issueId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: issuesKeys.timeline(issueId) });
      // A mention in the comment may have added an observer.
      queryClient.invalidateQueries({ queryKey: issuesKeys.issuesListRoot });
    },
  });
}

export function useAddIssueObserver(issueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => addIssueObserver(issueId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: issuesKeys.issuesListRoot });
      queryClient.invalidateQueries({ queryKey: issuesKeys.timeline(issueId) });
    },
  });
}

export function useRemoveIssueObserver(issueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => removeIssueObserver(issueId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: issuesKeys.issuesListRoot });
    },
  });
}
