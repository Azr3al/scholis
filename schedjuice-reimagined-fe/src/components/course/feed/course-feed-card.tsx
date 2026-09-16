"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";

import { CourseFeedComposer } from "@/components/course/feed/course-feed-composer";
import {
  courseFeedPostToViewModel,
  FeedPostActionsMenu,
  FeedPostView,
} from "@/components/feed";
import { Button } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import { deleteEntity, searchEntities } from "@/app/client-api/utils";
import { resendAnnouncementToTeams } from "@/app/client-api/microsoft";
import { queryClient } from "@/lib/query";
import {
  authorId,
  type CourseFeedPost,
} from "@/types/course-feed";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import type { attachmentType } from "@/types/attachment";
import { isRasterImageFilename } from "@/helpers/file";
import { cn } from "@/lib/utils";

export type CourseFeedCardProps = {
  post: CourseFeedPost;
  timezone: string;
  canEdit: boolean;
  microsoftGroupId?: string | null;
  microsoftChannelId?: string | null;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
};

export function CourseFeedCard({
  post,
  timezone,
  canEdit,
  microsoftGroupId,
  microsoftChannelId,
  isEditing,
  onEdit,
  onCancelEdit,
  onDelete,
}: CourseFeedCardProps) {
  const toast = useToast();
  const { user } = useUser();
  const postViewModel = useMemo(() => courseFeedPostToViewModel(post), [post]);
  const postAuthorId = authorId(post.created_by);
  const isAuthor =
    postAuthorId == null || user?.id == null || postAuthorId === user.id;
  const retryBlockedReason =
    post.send_to_microsoft &&
    post.microsoft_teams_status === "failed" &&
    !isAuthor
      ? "Only the original author can retry Teams sync for this post."
      : null;

  const courseId = Number(post.course);
  const resendMutation = useMutation({
    mutationFn: () => resendAnnouncementToTeams(post.id),
    onSuccess: () => {
      toast.add({ description: "Posted to Teams" });
      queryClient.invalidateQueries({ queryKey: ["courseFeed", courseId] });
    },
    onError: (e: unknown) => {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.details
          ? String(e.response.data.details)
          : "Could not resend to Teams";
      toast.add({ description: msg });
      queryClient.invalidateQueries({ queryKey: ["courseFeed", courseId] });
    },
  });

  const showTeamsResend =
    post.send_to_microsoft && post.microsoft_teams_status === "failed";

  const { data: legacyAttachments } = useQuery({
    queryKey: ["announcementJuiceBoxAttachments", post.id],
    queryFn: () =>
      searchEntities(
        "attachments",
        { page: 1, size: -1 },
        {
          filter_params: [
            {
              field_name: "table_name",
              value: "announcement",
              operator: operatorEnum.exact,
            },
            {
              field_name: "foreign_key",
              value: String(post.id),
              operator: operatorEnum.exact,
            },
          ],
        },
      ),
    enabled: !post.attachments?.length,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const attachments: attachmentType[] = (
    post.attachments?.length
      ? post.attachments
      : (legacyAttachments?.data?.data as attachmentType[] | undefined) ?? []
  ).filter((a) => !isRasterImageFilename(a.filename));

  const deleteMutation = useMutation({
    mutationFn: () => deleteEntity("announcements", post.id),
    onSuccess: () => {
      toast.add({ description: "Post deleted" });
      queryClient.invalidateQueries({ queryKey: ["courseFeed", courseId] });
      onDelete();
    },
    onError: () => {
      toast.add({ description: "Could not delete post" });
    },
  });

  if (isEditing) {
    return (
      <CourseFeedComposer
        courseId={Number(post.course)}
        mode="edit"
        initialPost={post}
        microsoftGroupId={microsoftGroupId}
        microsoftChannelId={microsoftChannelId}
        defaultExpanded
        onCancel={onCancelEdit}
        onSuccess={onCancelEdit}
      />
    );
  }

  return (
    <FeedPostView
      post={postViewModel}
      timezone={timezone}
      attachments={attachments}
      metaSlot={
        post.send_to_microsoft ? (
          <span className="inline-flex flex-wrap items-center gap-1">
            <TeamsSyncStatusChip
              status={post.microsoft_teams_status}
              error={post.microsoft_teams_error}
              retryBlockedReason={retryBlockedReason}
            />
            {showTeamsResend ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] uppercase tracking-wide"
                disabled={!isAuthor || resendMutation.isPending}
                isLoading={resendMutation.isPending}
                title={retryBlockedReason ?? undefined}
                onClick={() => resendMutation.mutate()}
              >
                Resend
              </Button>
            ) : null}
          </span>
        ) : null
      }
      actionsSlot={
        canEdit ? (
          <FeedPostActionsMenu
            items={[
              { id: "edit", label: "Edit", onSelect: onEdit },
              {
                id: "delete",
                label: "Delete",
                onSelect: () => {},
                destructive: true,
              },
            ]}
            deleteDialog={{
              title: "Delete post?",
              description: "This cannot be undone.",
              onConfirm: () => deleteMutation.mutate(),
              isLoading: deleteMutation.isPending,
            }}
          />
        ) : null
      }
    />
  );
}

function TeamsSyncStatusChip({
  status,
  error,
  retryBlockedReason,
}: {
  status?: CourseFeedPost["microsoft_teams_status"];
  error?: string | null;
  retryBlockedReason?: string | null;
}) {
  const label =
    status === "sent"
      ? "Teams: Sent"
      : status === "pending"
        ? "Teams: Pending"
        : status === "failed"
          ? "Teams: Failed"
          : "Teams";

  const className =
    status === "sent"
      ? "text-emerald-700 bg-emerald-50"
      : status === "pending"
        ? "text-amber-800 bg-amber-50"
        : status === "failed"
          ? "text-destructive bg-destructive/10"
          : "text-muted-foreground bg-muted/50";

  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
        className,
      )}
      title={
        status === "failed"
          ? retryBlockedReason ?? error ?? undefined
          : undefined
      }
    >
      {label}
    </span>
  );
}
