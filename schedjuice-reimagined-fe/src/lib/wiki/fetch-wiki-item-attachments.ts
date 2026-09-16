import { fetchJuiceBoxAttachments } from "@/lib/juicebox/fetch-by-resource";

export type WikiItemAttachmentPreview = {
  itemId: number;
  downloadUrl: string;
  filename: string;
};

/** Parallel JuiceBox fetches keyed by wiki item id (one queryFn batch, not per-tile hooks). */
export async function fetchWikiItemAttachmentsByItemIds(
  itemIds: number[],
): Promise<Record<number, WikiItemAttachmentPreview>> {
  const uniqueIds = Array.from(
    new Set(itemIds.filter((id) => Number.isFinite(id) && id > 0)),
  );
  if (uniqueIds.length === 0) {
    return {};
  }

  const rows = await Promise.all(
    uniqueIds.map(async (itemId) => {
      try {
        const response = await fetchJuiceBoxAttachments(
          "app_wiki_item",
          String(itemId),
        );
        const attachment = response.attachments?.[0];
        const downloadUrl =
          attachment?.downloadUrl ?? attachment?.download_url ?? null;
        if (!downloadUrl) {
          return null;
        }
        return {
          itemId,
          downloadUrl,
          filename: attachment?.filename ?? "",
        };
      } catch {
        return null;
      }
    }),
  );

  const map: Record<number, WikiItemAttachmentPreview> = {};
  for (const row of rows) {
    if (row) {
      map[row.itemId] = row;
    }
  }
  return map;
}

export function wikiItemAttachmentsQueryKey(itemIds: number[]) {
  const sorted = [...itemIds].sort((a, b) => a - b);
  return ["wiki-item-attachments", sorted.join(",")] as const;
}
