"use client";

import { Button } from "@/components/primitives";
import { ChatBubble as MessageCircle } from "iconoir-react";

const ChatTriggerButton = ({
  handleChatListsTrigger,
}: {
  handleChatListsTrigger: () => void;
}) => {
  return (
    <Button
      type="button"
      size="sm"
      aria-label="Open chat"
      className="h-14 w-14 rounded-full shadow-lg p-0 hover:scale-105 transition-transform"
      onClick={handleChatListsTrigger}
    >
      <MessageCircle className="h-6 w-6" aria-hidden />
    </Button>
  );
};

export default ChatTriggerButton;
