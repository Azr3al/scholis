import type { DmEligibleUser } from "@/types/chat";

export type chatSectionStateType = {
  isOpen: boolean;
  kind?: "course" | "dm" | "group";
  courseId?: number;
  dmThreadId?: number;
  dmOtherParticipant?: DmEligibleUser | null;
  groupThreadId?: number;
  groupDisplayTitle?: string;
};

export const defaultChatSectionValue: chatSectionStateType = {
  isOpen: false,
  kind: "course",
  courseId: undefined,
  dmThreadId: undefined,
};
