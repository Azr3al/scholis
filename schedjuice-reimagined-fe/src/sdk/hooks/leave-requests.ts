"use client";

import { useToast } from "@/components/primitives";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ListLeaveRequestsArgs } from "../resources/leave-requests";
import {
  approveLeaveRequest,
  denyLeaveRequest,
  fetchLeaveRequest,
  leaveRequestsKeys,
  listLeaveRequests,
} from "../resources/leave-requests";

export function useLeaveRequestsList(args: ListLeaveRequestsArgs & { enabled?: boolean }) {
  const { enabled = true, ...listArgs } = args;
  return useQuery({
    queryKey: leaveRequestsKeys.list(listArgs),
    queryFn: () => listLeaveRequests(listArgs),
    enabled,
  });
}

export function useLeaveRequestDetail(id: number | null) {
  return useQuery({
    queryKey: leaveRequestsKeys.detail(id ?? 0),
    queryFn: () => fetchLeaveRequest(id as number),
    enabled: id != null && id > 0,
  });
}

export function useApproveLeaveRequest() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: number) => approveLeaveRequest(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: leaveRequestsKeys.all });
      toast.add({
        type: "success",
        title: "Leave approved",
        description: "Attendance was updated for the requested dates.",
      });
      void queryClient.invalidateQueries({ queryKey: leaveRequestsKeys.detail(id) });
    },
    onError: () => {
      toast.add({
        type: "error",
        title: "Could not approve",
        description: "This request may no longer be pending.",
      });
    },
  });
}

export function useDenyLeaveRequest() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, denial_reason }: { id: number; denial_reason: string }) =>
      denyLeaveRequest(id, denial_reason),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: leaveRequestsKeys.all });
      toast.add({
        type: "success",
        title: "Leave denied",
        description: "The student was notified.",
      });
      void queryClient.invalidateQueries({ queryKey: leaveRequestsKeys.detail(id) });
    },
    onError: () => {
      toast.add({
        type: "error",
        title: "Could not deny",
        description: "Check the denial reason and try again.",
      });
    },
  });
}
