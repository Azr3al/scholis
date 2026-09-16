import type { chatSectionStateType } from "@/components/course/chat/chat-panel-state";
import {
  buildChatThreadHref,
  CHAT_INBOX_PATH,
  type ChatThreadNavTarget,
} from "./chat-routes";

export function chatSectionToNavTarget(
  section: chatSectionStateType,
): ChatThreadNavTarget | null {
  if (!section.isOpen) {
    return null;
  }

  if (section.kind === "course" && section.courseId != null) {
    return {
      kind: "course",
      courseId: section.courseId,
    };
  }

  if (section.kind === "group" && section.groupThreadId != null) {
    return {
      kind: "group",
      threadId: section.groupThreadId,
      title: section.groupDisplayTitle,
    };
  }

  if (section.kind === "dm") {
    if (section.dmThreadId != null) {
      return {
        kind: "dm",
        threadId: section.dmThreadId,
        title: section.dmOtherParticipant?.name,
        otherParticipant: section.dmOtherParticipant,
      };
    }
    if (section.dmOtherParticipant) {
      return {
        kind: "dm",
        participantUserId: section.dmOtherParticipant.id,
        title: section.dmOtherParticipant.name,
        otherParticipant: section.dmOtherParticipant,
      };
    }
  }

  return null;
}

export function chatSectionToHref(section: chatSectionStateType): string {
  const target = chatSectionToNavTarget(section);
  if (!target) {
    return CHAT_INBOX_PATH;
  }
  return buildChatThreadHref(target);
}
