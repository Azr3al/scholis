"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChatAttachmentRenderer } from "@/components/course/chat/chat-attachment-renderer";
import { Button, Skeleton } from "@/components/primitives";
import { ComplaintComposer } from "@/components/complaints/complaint-composer";
import { useUser } from "@/hooks/useUser";
import {
  complaintsKeys,
  useComplaintTimeline,
  useComplaints,
  usePostComplaintComment,
  useReopenComplaint,
} from "@/hooks/complaints/use-complaints";
import { resolveChatAttachmentsByIds } from "@/lib/chat/chat-attachments";
import {
  buildChatAttachmentUrlMap,
  hydrateChatAttachmentRef,
} from "@/lib/chat/hydrate-chat-attachment-urls";
import {
  mapComplaintTimelineToBubbles,
  type ComplaintTimelineBubble,
} from "@/lib/complaints/complaint-timeline";
import {
  isComplaintClosed,
  resolveOpenStatusIdFromIssues,
} from "@/lib/complaints/complaint-status";
import { emojify } from "@/lib/emoji";
import { cn } from "@/lib/utils";
import {
  chatAttachmentRefNeedsResolve,
  normalizeChatAttachmentRef,
} from "@/lib/chat/normalize-chat-attachment-ref";
import type { ChatAttachmentRef } from "@/types/chat";
import type { Issue } from "@/types/issue";

function collectUnresolvedAttachmentIds(bubbles: ComplaintTimelineBubble[]): number[] {
  const ids = new Set<number>();
  for (const bubble of bubbles) {
    for (const attachment of bubble.attachments) {
      const normalized = normalizeChatAttachmentRef(attachment);
      if (chatAttachmentRefNeedsResolve(normalized)) {
        ids.add(normalized.attachment_id);
      }
    }
  }
  return Array.from(ids).sort((a, b) => a - b);
}

function ComplaintBubble({
  bubble,
}: {
  bubble: ComplaintTimelineBubble;
}) {
  if (bubble.isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="rounded-full bg-muted/50 px-2.5 py-0.5 text-[11px] text-muted-foreground">
          {bubble.systemLabel ?? bubble.text}
        </span>
      </div>
    );
  }

  const isMe = bubble.isMe;
  const text = emojify(bubble.text);

  return (
    <div className={cn("flex", isMe ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] px-3 py-2 text-sm break-words",
          isMe
            ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground"
            : "rounded-2xl rounded-bl-md bg-muted/60 text-foreground",
        )}
      >
        {text ? <div>{text}</div> : null}
        {bubble.attachments.length > 0 ? (
          <ChatAttachmentRenderer attachments={bubble.attachments} isMe={isMe} />
        ) : null}
      </div>
    </div>
  );
}

function ComplaintTimelineSkeleton() {
  return (
    <div className="space-y-4 py-4" aria-busy="true" aria-label="Loading conversation">
      {Array.from({ length: 4 }).map((_, index) => {
        const own = index % 2 === 1;
        return (
          <div
            key={index}
            className={cn("flex", own ? "justify-end" : "justify-start")}
          >
            <Skeleton
              className={cn(
                "h-12 rounded-2xl",
                own ? "w-56 rounded-br-md" : "w-64 rounded-bl-md",
              )}
            />
          </div>
        );
      })}
    </div>
  );
}

export function ComplaintConversation({
  issue,
  adminTitle,
}: {
  issue: Issue;
  adminTitle: string;
}) {
  const { user } = useUser(false);
  const queryClient = useQueryClient();
  const { data: issues = [] } = useComplaints();
  const timelineQuery = useComplaintTimeline(issue.id);
  const postComment = usePostComplaintComment(issue.id);
  const reopenComplaint = useReopenComplaint(issue.id);

  const rawBubbles = useMemo(() => {
    if (!timelineQuery.data || user?.id == null) return [];
    return mapComplaintTimelineToBubbles(timelineQuery.data, user.id);
  }, [timelineQuery.data, user?.id]);

  const attachmentIds = useMemo(
    () => collectUnresolvedAttachmentIds(rawBubbles),
    [rawBubbles],
  );

  const attachmentQuery = useQuery({
    queryKey: ["juicebox-complaint-attachments", attachmentIds.join(",")],
    queryFn: () => resolveChatAttachmentsByIds(attachmentIds),
    enabled: attachmentIds.length > 0,
    staleTime: 45 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const bubbles = useMemo(() => {
    const normalizedBubbles = rawBubbles.map((bubble) => ({
      ...bubble,
      attachments: bubble.attachments.map((ref) => normalizeChatAttachmentRef(ref)),
    }));

    if (!attachmentQuery.data?.length) {
      return normalizedBubbles;
    }

    const urlMap = buildChatAttachmentUrlMap(attachmentQuery.data);
    return normalizedBubbles.map((bubble) => ({
      ...bubble,
      attachments: bubble.attachments.map((ref) =>
        ref.download_url ? ref : hydrateChatAttachmentRef(ref, urlMap),
      ),
    }));
  }, [rawBubbles, attachmentQuery.data]);

  const closed = isComplaintClosed(issue);
  const openStatusId =
    queryClient.getQueryData<number>(complaintsKeys.openStatusId) ??
    resolveOpenStatusIdFromIssues(issues);

  const handleSend = async (input: {
    body?: string;
    attachments?: ChatAttachmentRef[];
  }) => {
    await postComment.mutateAsync(input);
  };

  const handleReopen = async () => {
    if (openStatusId == null) return;
    await reopenComplaint.mutateAsync(openStatusId);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-medium text-text-primary">{adminTitle}</p>
        <p className="text-xs text-text-muted">School staff may reply here.</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {timelineQuery.isLoading ? (
          <ComplaintTimelineSkeleton />
        ) : bubbles.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">No messages yet.</p>
        ) : (
          <div className="space-y-2">
            {bubbles.map((bubble) => (
              <ComplaintBubble key={bubble.id} bubble={bubble} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-surface p-4">
        {closed ? (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">This complaint is closed.</p>
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              isLoading={reopenComplaint.isPending}
              disabled={openStatusId == null}
              onClick={() => void handleReopen()}
            >
              Reopen complaint
            </Button>
          </div>
        ) : (
          <ComplaintComposer
            foreignKey={`${issue.id}`}
            onSend={handleSend}
            isSending={postComment.isPending}
            disabled={postComment.isPending}
          />
        )}
      </div>
    </div>
  );
}
