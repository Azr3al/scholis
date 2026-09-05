"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { ChatAttachmentRenderer } from "@/components/course/chat/chat-attachment-renderer";
import { Skeleton } from "@/components/primitives";
import { resolveChatAttachmentsByIds } from "@/lib/chat/chat-attachments";
import {
  leaveAttachmentToChatRef,
  mergeLeaveAttachmentDownloadUrl,
} from "@/lib/leave-requests/leave-attachment-ref";
import type { LeaveRequestAttachment } from "@/sdk/_types/leave-requests";

export function LeaveRequestAttachment({
  attachment,
}: {
  attachment: LeaveRequestAttachment;
}) {
  const baseRef = useMemo(
    () => leaveAttachmentToChatRef(attachment),
    [attachment],
  );

  const resolved = useQuery({
    queryKey: ["leave-request-attachment", attachment.id],
    queryFn: () => resolveChatAttachmentsByIds([attachment.id]),
    enabled:
      Number.isFinite(attachment.id) &&
      attachment.id > 0 &&
      !baseRef.download_url,
    staleTime: 45 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const displayRef = useMemo(
    () => mergeLeaveAttachmentDownloadUrl(baseRef, resolved.data),
    [baseRef, resolved.data],
  );

  if (resolved.isLoading && !baseRef.download_url) {
    return <Skeleton className="h-24 w-full max-w-sm rounded-2xl" aria-busy />;
  }

  const fallbackLabel = attachment.filename?.trim() || "Attachment unavailable";

  if (!displayRef.download_url) {
    return <p className="text-sm text-muted-foreground">{fallbackLabel}</p>;
  }

  return <ChatAttachmentRenderer attachments={[displayRef]} isMe={false} />;
}
