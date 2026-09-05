"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ChatTriggerButton from "./chat-trigger-button";
import ChatSection from "./chat-section";
import ChatLists from "./chat-lists";
import DmSection from "@/components/chat/dm/dm-section";
import {
  defaultChatSectionValue,
  type chatSectionStateType,
} from "./chat-panel-state";
import { useTenant } from "@/hooks/useTenant";
import { isCourseWideChatEnabled } from "@/lib/chat/course-wide-chat-access";
import { chatSectionToHref } from "@/lib/chat/chat-section-to-nav";

export type { chatSectionStateType } from "./chat-panel-state";
export { defaultChatSectionValue } from "./chat-panel-state";

const ChatArea = () => {
  const router = useRouter();
  const { tenant } = useTenant();
  const courseWideChatEnabled = isCourseWideChatEnabled(tenant);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatSection, setChatSection] = useState<chatSectionStateType>(
    defaultChatSectionValue
  );

  const closePanel = () => {
    setIsChatOpen(false);
    setChatSection(defaultChatSectionValue);
  };

  const handleExpand = () => {
    router.push(chatSectionToHref(chatSection));
    closePanel();
  };

  return (
    <div className="fixed right-5 bottom-5 z-dropdown max-md:bottom-[calc(1.25rem+4.5rem+env(safe-area-inset-bottom,0px))]">
      {isChatOpen ? (
        <div className="w-[380px] h-[560px] bg-background border border-border rounded-2xl shadow-xl flex flex-col overflow-hidden">
          {chatSection.isOpen &&
          courseWideChatEnabled &&
          chatSection.kind === "course" &&
          chatSection.courseId ? (
            <ChatSection
              courseId={chatSection.courseId}
              onExpand={handleExpand}
              handleChatListsClose={closePanel}
              handleChatSectionBack={() =>
                setChatSection(defaultChatSectionValue)
              }
            />
          ) : chatSection.isOpen &&
            chatSection.kind === "group" &&
            chatSection.groupThreadId ? (
            <DmSection
              threadId={chatSection.groupThreadId}
              threadKind="group"
              groupDisplayTitle={chatSection.groupDisplayTitle}
              otherParticipant={{
                id: 0,
                name: chatSection.groupDisplayTitle ?? "Class chat",
                email: "",
                profile_image: null,
              }}
              onExpand={handleExpand}
              handleChatListsClose={closePanel}
              handleChatSectionBack={() =>
                setChatSection(defaultChatSectionValue)
              }
            />
          ) : chatSection.isOpen &&
            chatSection.kind === "dm" &&
            chatSection.dmOtherParticipant ? (
            <DmSection
              threadId={chatSection.dmThreadId}
              otherParticipant={chatSection.dmOtherParticipant}
              onExpand={handleExpand}
              handleChatListsClose={closePanel}
              handleChatSectionBack={() =>
                setChatSection(defaultChatSectionValue)
              }
            />
          ) : (
            <ChatLists
              setChatSection={setChatSection}
              handleChatListsClose={closePanel}
              onExpand={handleExpand}
            />
          )}
        </div>
      ) : (
        <ChatTriggerButton handleChatListsTrigger={() => setIsChatOpen(true)} />
      )}
    </div>
  );
};

export default ChatArea;
