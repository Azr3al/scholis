"use client";

import { useMemo } from "react";
import ChatLists from "@/components/course/chat/chat-lists";
import {
  buildChatThreadHref,
  type ChatThreadNavTarget,
} from "@/lib/chat/chat-routes";

export function ChatInboxView({
  onNavigate,
  activePathname,
}: {
  onNavigate: (href: string) => void;
  activePathname: string;
}) {
  const handleSelectThread = (target: ChatThreadNavTarget) => {
    onNavigate(buildChatThreadHref(target));
  };

  const activeThreadId = useMemo(() => {
    const match = activePathname.match(/^\/chat\/threads\/(\d+)$/);
    if (!match) {
      return null;
    }
    const parsed = Number.parseInt(match[1] ?? "", 10);
    return Number.isFinite(parsed) ? parsed : null;
  }, [activePathname]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ChatLists
        variant="page"
        onSelectThread={handleSelectThread}
        activeThreadId={activeThreadId}
      />
    </div>
  );
}
