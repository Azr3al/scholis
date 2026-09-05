import { useQuery } from "@tanstack/react-query";

import {
  fetchWikiItemAttachmentsByItemIds,
  wikiItemAttachmentsQueryKey,
} from "@/lib/wiki/fetch-wiki-item-attachments";

export function useWikiItemAttachments(itemIds: number[], enabled = true) {
  return useQuery({
    queryKey: wikiItemAttachmentsQueryKey(itemIds),
    enabled: enabled && itemIds.length > 0,
    refetchOnWindowFocus: false,
    queryFn: () => fetchWikiItemAttachmentsByItemIds(itemIds),
  });
}
