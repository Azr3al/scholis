import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchLeads,
  fetchLeadStatuses,
  fetchLeadSources,
  fetchLeadMentionCandidates,
  moveLead,
  postLeadComment,
  addLeadObserver,
  removeLeadObserver,
  type AppointmentInput,
  type PostLeadCommentInput,
  type StudentInput,
} from "@/lib/leads-api";
import { applyOptimisticMove } from "@/lib/leads-board";
import type { Lead } from "@/types/lead";

export const leadsKeys = {
  leads: ["leads", "list"] as const,
  statuses: ["leads", "statuses"] as const,
  sources: ["leads", "sources"] as const,
  timeline: (id: number) => ["leads", "timeline", id] as const,
  mentionCandidates: (search = "") => ["leads", "mention-candidates", search.trim()] as const,
};

export function useLeadStatuses() {
  return useQuery({ queryKey: leadsKeys.statuses, queryFn: fetchLeadStatuses });
}

export function useLeadSources() {
  return useQuery({ queryKey: leadsKeys.sources, queryFn: fetchLeadSources });
}

export function useLeads() {
  return useQuery({ queryKey: leadsKeys.leads, queryFn: fetchLeads });
}

export function useMoveLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      leadId: number;
      statusId: number;
      appointment?: AppointmentInput;
      student?: StudentInput;
    }) =>
      moveLead(vars.leadId, vars.statusId, {
        appointment: vars.appointment,
        student: vars.student,
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: leadsKeys.leads });
      const previous = queryClient.getQueryData<Lead[]>(leadsKeys.leads);
      if (previous) {
        queryClient.setQueryData<Lead[]>(
          leadsKeys.leads,
          applyOptimisticMove(previous, vars.leadId, vars.statusId),
        );
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(leadsKeys.leads, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.leads });
    },
  });
}

/** Board-view roster for the shared mention composer / observers picker (all users with `lead.view`). */
export function useLeadMentionCandidates(search = "") {
  const normalized = search.trim();
  return useQuery({
    queryKey: leadsKeys.mentionCandidates(normalized),
    queryFn: () => fetchLeadMentionCandidates(normalized || undefined),
    staleTime: normalized ? 10_000 : 60_000,
  });
}

export function useAddLeadComment(leadId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PostLeadCommentInput) => postLeadComment(leadId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.timeline(leadId) });
      // A mention in the comment may have added an observer.
      queryClient.invalidateQueries({ queryKey: leadsKeys.leads });
    },
  });
}

export function useAddLeadObserver(leadId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => addLeadObserver(leadId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.leads });
      queryClient.invalidateQueries({ queryKey: leadsKeys.timeline(leadId) });
    },
  });
}

export function useRemoveLeadObserver(leadId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => removeLeadObserver(leadId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadsKeys.leads });
    },
  });
}
