"use client";

import { useEffect, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ChatSection from "@/components/course/chat/chat-section";
import DmSection from "@/components/chat/dm/dm-section";
import { parseChatThreadSearchParams } from "@/lib/chat/chat-routes";
import type { DmEligibleUser } from "@/types/chat";

export function ChatThreadView() {
  const router = useRouter();
  const params = useParams<{ threadId: string }>();
  const searchParams = useSearchParams();

  const parsed = useMemo(() => {
    const threadIdParam = params.threadId;
    if (!threadIdParam) {
      return null;
    }
    return parseChatThreadSearchParams(
      threadIdParam,
      new URLSearchParams(searchParams.toString()),
    );
  }, [params.threadId, searchParams]);

  useEffect(() => {
    if (!parsed) {
      router.replace("/chat");
    }
  }, [parsed, router]);

  const draftParticipant = useMemo((): DmEligibleUser | null => {
    if (parsed?.kind !== "dm" || parsed.participantUserId == null) {
      return null;
    }
    return {
      id: parsed.participantUserId,
      name: parsed.title ?? "",
      email: "",
      profile_image: null,
    };
  }, [parsed]);

  if (!parsed) {
    return null;
  }

  const handleBack = () => {
    router.push("/chat");
  };

  if (parsed.kind === "course") {
    return (
      <ChatSection
        courseId={parsed.courseId}
        layout="page"
        handleChatListsClose={handleBack}
        handleChatSectionBack={handleBack}
      />
    );
  }

  if (parsed.kind === "group") {
    return (
      <DmSection
        threadId={parsed.threadId}
        threadKind="group"
        groupDisplayTitle={parsed.title}
        layout="page"
        handleChatListsClose={handleBack}
        handleChatSectionBack={handleBack}
      />
    );
  }

  const dmThreadId =
    parsed.threadId === "new" ? undefined : parsed.threadId;

  return (
    <DmSection
      threadId={dmThreadId}
      otherParticipant={draftParticipant}
      threadKind="dm"
      layout="page"
      handleChatListsClose={handleBack}
      handleChatSectionBack={handleBack}
    />
  );
}
