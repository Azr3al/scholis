"use client";
import { useMutation } from "@tanstack/react-query";
import { updateEntity } from "@/app/client-api/utils";
import { useToast } from "@/components/primitives";
import { invalidateCourseSummaryCaches } from "@/lib/course-cache";
import { queryClient } from "@/lib/query";
import { Button } from "@/components/primitives";
import { courseJoinRequestStatus } from "@/types/course";

interface JoinRequestButtonsProps {
  requestId: number;
  courseId?: number | string;
  onUpdated?: () => void;
}

export const JoinRequestButtons = ({
  requestId,
  courseId,
  onUpdated,
}: JoinRequestButtonsProps) => {
  const toast = useToast();
  const statusUpdateMutation = useMutation({
    mutationFn: (newStatus: string) =>
      updateEntity("course-join-requests", requestId, { status: newStatus }),
    onSuccess: (_data, newStatus) => {
      toast.add({ title: "Status updated successfully" });
      void queryClient.refetchQueries({ queryKey: ["course-join-requests"] });
      onUpdated?.();
      if (newStatus === courseJoinRequestStatus.approved) {
        void invalidateCourseSummaryCaches(queryClient, courseId);
      }
    },
    onError: () => {
      toast.add({
        title: "Failed to update status",
        description: "Please try again later.",
      });
    },
  });

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        size="sm"
        variant="primary"
        isLoading={statusUpdateMutation.isPending}
        onClick={() =>
          statusUpdateMutation.mutate(courseJoinRequestStatus.approved)
        }
        disabled={statusUpdateMutation.isPending}
      >
        Approve
      </Button>
      <Button
        isLoading={statusUpdateMutation.isPending}
        type="button"
        size="sm"
        variant="danger"
        onClick={() =>
          statusUpdateMutation.mutate(courseJoinRequestStatus.rejected)
        }
        disabled={statusUpdateMutation.isPending}
      >
        Reject
      </Button>
    </div>
  );
};
