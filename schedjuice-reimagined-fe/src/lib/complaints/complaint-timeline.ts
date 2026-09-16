import type { ChatAttachmentRef } from "@/types/chat";
import type { IssueTimelineItem } from "@/types/issue";

export type ComplaintTimelineBubble = {
  id: string;
  text: string;
  isMe: boolean;
  attachments: ChatAttachmentRef[];
  isSystem: boolean;
  systemLabel?: string;
};

function eventSystemLabel(
  item: IssueTimelineItem & { kind: "event" },
): string {
  const message = item.message?.trim();
  if (message) return message;

  const payload = item.payload ?? {};
  const to = typeof payload.to === "string" ? payload.to.trim() : "";
  const from = typeof payload.from === "string" ? payload.from.trim() : "";

  switch (item.event_type) {
    case "created":
      return "Complaint submitted";
    case "status_changed":
      if (to === "Done") return "Your complaint was marked resolved";
      if (to === "Cancelled") return "Your complaint was cancelled";
      if (to === "Open" && (from === "Done" || from === "Cancelled")) {
        return "Your complaint was reopened";
      }
      if (to) return `Your complaint status changed to ${to}`;
      return "Your complaint status was updated";
    default:
      return item.event_type;
  }
}

export function mapComplaintTimelineToBubbles(
  items: IssueTimelineItem[],
  currentUserId: number,
): ComplaintTimelineBubble[] {
  return items.map((item) => {
    if (item.kind === "event") {
      const label = eventSystemLabel(item);
      return {
        id: `event-${item.id}`,
        text: label,
        isMe: false,
        attachments: [],
        isSystem: true,
        systemLabel: label,
      };
    }

    const actorId = item.actor?.id;
    return {
      id: `comment-${item.id}`,
      text: item.body,
      isMe: actorId != null && actorId === currentUserId,
      attachments: item.attachments ?? [],
      isSystem: false,
    };
  });
}
