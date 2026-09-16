import { hydrateChatAttachmentRef, buildChatAttachmentUrlMap } from "@/lib/chat/hydrate-chat-attachment-urls";
import type { ChatAttachmentRef } from "@/types/chat";
import type { IssueTimelineItem } from "@/types/issue";

export function collectIssueTimelineAttachmentIds(items: IssueTimelineItem[]): number[] {
  const ids = new Set<number>();
  for (const item of items) {
    if (item.kind !== "comment") continue;
    for (const attachment of item.attachments ?? []) {
      if (Number.isFinite(attachment.attachment_id)) {
        ids.add(attachment.attachment_id);
      }
    }
  }
  return Array.from(ids).sort((a, b) => a - b);
}

export function hydrateIssueTimelineAttachments(
  items: IssueTimelineItem[],
  resolvedRefs: ChatAttachmentRef[]
): IssueTimelineItem[] {
  if (resolvedRefs.length === 0) return items;

  const urlMap = buildChatAttachmentUrlMap(resolvedRefs);
  return items.map((item) => {
    if (item.kind !== "comment" || !item.attachments?.length) {
      return item;
    }
    return {
      ...item,
      attachments: item.attachments.map((ref) => hydrateChatAttachmentRef(ref, urlMap)),
    };
  });
}
