"use client";

import { useMemo } from "react";
import { Spinner } from "@/components/primitives/spinner";
import { ChatPageShell } from "@/components/chat/chat-page-shell";
import { usePageHeader } from "@/components/shell/use-page-header";
import { usePermissions } from "@/hooks/usePermissions";
import { useUser } from "@/hooks/useUser";
import { dmChatCopy } from "@/messages/dm-chat";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading: isUserLoading } = useUser();
  const { canAny } = usePermissions();
  const canParticipate = canAny(["chat.participate"]);

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">
          {dmChatCopy.messagesTitle}
        </h1>
      ),
    }),
    [],
  );

  usePageHeader(!isUserLoading && user && canParticipate ? headerConfig : null);

  if (isUserLoading) {
    return (
      <div className="flex min-h-[min(32rem,70vh)] flex-1 items-center justify-center">
        <Spinner className="h-8 w-8 text-text-muted" aria-busy />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!canParticipate) {
    return (
      <div className="flex min-h-[min(32rem,70vh)] flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-base font-medium text-text-primary">
          {dmChatCopy.accessDeniedTitle}
        </p>
        <p className="max-w-md text-sm text-text-secondary">
          {dmChatCopy.accessDeniedBody}
        </p>
      </div>
    );
  }

  return <ChatPageShell>{children}</ChatPageShell>;
}
