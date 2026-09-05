import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { resolveChatAttachmentsByIds } from "@/lib/chat/chat-attachments";
import {
  buildChatAttachmentUrlMap,
  collectChatAttachmentIds,
  hydrateChatMessageAttachments,
  stripBackendAttachmentUrls,
} from "@/lib/chat/hydrate-chat-attachment-urls";
import type { ChatMessage } from "@/types/chat";

/** JuiceBox presigned URLs expire after ~1h; refresh before that. */
const JUICE_BOX_CHAT_ATTACHMENTS_STALE_MS = 45 * 60 * 1000;

const juiceBoxChatAttachmentsQueryKey = (attachmentIds: number[]) =>
  ["juicebox-chat-attachments", attachmentIds.join(",")] as const;

export function useHydratedChatMessages(messages: ChatMessage[]): ChatMessage[] {
  const attachmentIds = useMemo(() => collectChatAttachmentIds(messages), [messages]);

  const query = useQuery({
    queryKey:
      attachmentIds.length > 0
        ? juiceBoxChatAttachmentsQueryKey(attachmentIds)
        : ["juicebox-chat-attachments", "disabled"],
    queryFn: () => resolveChatAttachmentsByIds(attachmentIds),
    enabled: attachmentIds.length > 0,
    staleTime: JUICE_BOX_CHAT_ATTACHMENTS_STALE_MS,
    cacheTime: 60 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const urlMap = useMemo(() => {
    if (!query.data) return null;
    return buildChatAttachmentUrlMap(query.data);
  }, [query.data]);

  const missingIdsKey = useMemo(() => {
    if (!urlMap || attachmentIds.length === 0) return "";
    const missing = attachmentIds.filter((id) => {
      const row = urlMap.get(id);
      return !row?.download_url;
    });
    return missing.join(",");
  }, [attachmentIds, urlMap]);

  useEffect(() => {
    if (!missingIdsKey || query.isFetching) return;
    void query.refetch();
  }, [missingIdsKey, query.isFetching, query.refetch]);

  return useMemo(() => {
    if (!urlMap) {
      return messages.map((message) => stripBackendAttachmentUrls(message));
    }
    return messages.map((message) => hydrateChatMessageAttachments(message, urlMap));
  }, [messages, urlMap]);
}
