"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  announcementRowToViewModel,
  FeedPostActionsMenu,
  FeedPostView,
  type AnnouncementRow,
} from "@/components/feed";
import { useToast } from "@/components/primitives";
import {
  updateEntity,
  deleteEntity,
  searchEntities,
} from "@/app/client-api/utils";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import type { attachmentType } from "@/types/attachment";

export type AnnouncementEditInfo = {
  isEdit: boolean;
  toEditId?: number;
};

export type AnnouncementCardProps = AnnouncementRow & {
  setIsEditInfo: (info: AnnouncementEditInfo) => void;
  announcementId: string;
  deleteCustomFunction?: () => void;
};

const AnnouncementCard: React.FC<AnnouncementCardProps> = (props) => {
  const {
    id,
    setIsEditInfo,
    announcementId,
    deleteCustomFunction,
    attachments: attachmentsFromAnnouncement,
    is_pinned,
    ...row
  } = props;

  const queryClient = useQueryClient();
  const { isAdminOrManager, isTeacher } = useUser();
  const toast = useToast();
  const canEdit = isAdminOrManager || isTeacher;

  const announcementRow = useMemo(
    (): AnnouncementRow => ({
      id,
      is_pinned,
      attachments: attachmentsFromAnnouncement,
      ...row,
    }),
    [id, is_pinned, attachmentsFromAnnouncement, row],
  );

  const postViewModel = useMemo(
    () => announcementRowToViewModel(announcementRow),
    [announcementRow],
  );

  const {
    data: fetchedAttachments,
    isLoading: isAttachmentsLoading,
    refetch,
  } = useQuery({
    queryKey: ["getAttachments", announcementId, "announcements"],
    queryFn: () =>
      searchEntities(
        "attachments",
        { size: -1 },
        {
          filter_params: [
            {
              field_name: "table_name",
              value: "announcement",
              operator: operatorEnum.exact,
            },
            {
              field_name: "foreign_key",
              value: announcementId,
              operator: operatorEnum.exact,
            },
          ],
        },
      ),
    enabled: !attachmentsFromAnnouncement?.length,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const allAttachments: attachmentType[] =
    attachmentsFromAnnouncement ??
    fetchedAttachments?.data?.data ??
    [];

  useEffect(() => {
    if (announcementId && !attachmentsFromAnnouncement?.length) {
      refetch();
    }
  }, [announcementId, attachmentsFromAnnouncement?.length, refetch]);

  const togglePinMutation = useMutation({
    mutationFn: (nextPinned: boolean) =>
      updateEntity("announcements", id, { is_pinned: nextPinned }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcementList"] });
    },
  });

  const deleteAnnouncementMutation = useMutation({
    mutationKey: ["deleteAnnouncement", id],
    mutationFn: () => deleteEntity("announcements", id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcementList"] });
      toast.add({
        title: "Announcement deleted",
        description: "The announcement has been deleted successfully",
      });
      deleteCustomFunction?.();
    },
    onError: () => {
      toast.add({
        title: "Error",
        description: "Failed to delete announcement",
        type: "error",
      });
    },
  });

  return (
    <FeedPostView
      post={postViewModel}
      attachments={allAttachments}
      isAttachmentsLoading={
        isAttachmentsLoading && !attachmentsFromAnnouncement?.length
      }
      actionsSlot={
        canEdit ? (
          <FeedPostActionsMenu
            items={[
              {
                id: "edit",
                label: "Edit",
                onSelect: () => setIsEditInfo({ isEdit: true, toEditId: id }),
              },
              {
                id: "pin",
                label: is_pinned ? "Unpin" : "Pin",
                onSelect: () => togglePinMutation.mutate(!is_pinned),
              },
              {
                id: "delete",
                label: "Delete",
                onSelect: () => {},
                destructive: true,
              },
            ]}
            deleteDialog={{
              title: "Delete announcement?",
              description:
                "Are you sure you want to delete this announcement? This action cannot be undone.",
              onConfirm: () => deleteAnnouncementMutation.mutate(),
              isLoading: deleteAnnouncementMutation.isPending,
            }}
          />
        ) : null
      }
    />
  );
};

export default AnnouncementCard;
