import type { Dispatch, SetStateAction } from "react";
import type { chatSectionStateType } from "@/components/course/chat/chat-panel-state";
import {
  buildChatThreadHref,
  type ChatThreadNavTarget,
} from "@/lib/chat/chat-routes";

export type ChatThreadSelectionHandlers = {
  setChatSection?: Dispatch<SetStateAction<chatSectionStateType>>;
  onSelectThread?: (target: ChatThreadNavTarget) => void;
};

export function navTargetToChatSection(
  target: ChatThreadNavTarget,
): chatSectionStateType {
  if (target.kind === "course") {
    return {
      isOpen: true,
      kind: "course",
      courseId: target.courseId,
    };
  }

  if (target.kind === "group") {
    return {
      isOpen: true,
      kind: "group",
      groupThreadId: target.threadId,
      groupDisplayTitle: target.title,
    };
  }

  if (target.threadId != null) {
    return {
      isOpen: true,
      kind: "dm",
      dmThreadId: target.threadId,
      ...(target.otherParticipant
        ? { dmOtherParticipant: target.otherParticipant }
        : {}),
    };
  }

  return {
    isOpen: true,
    kind: "dm",
    dmOtherParticipant: target.otherParticipant ?? {
      id: target.participantUserId!,
      name: target.title ?? "",
      email: "",
      profile_image: null,
    },
  };
}

export function applyChatThreadSelection(
  target: ChatThreadNavTarget,
  handlers: ChatThreadSelectionHandlers,
) {
  if (handlers.onSelectThread) {
    handlers.onSelectThread(target);
    return;
  }
  handlers.setChatSection?.(navTargetToChatSection(target));
}

export function hrefFromChatThreadTarget(target: ChatThreadNavTarget): string {
  return buildChatThreadHref(target);
}
