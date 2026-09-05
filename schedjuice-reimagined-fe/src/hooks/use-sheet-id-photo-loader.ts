import { useCallback } from "react";
import type { IdPhotoUrlCache } from "@/lib/id-photo-url-cache";

type RowWithPhoto = { id: number; has_id_photo: boolean };

export function useSheetIdPhotoLoader<T extends RowWithPhoto>(
  rows: T[],
  cache: Pick<IdPhotoUrlCache, "getUrl" | "requestUrls">,
) {
  return useCallback(
    (range: { y: number; height: number }) => {
      const start = Math.max(0, range.y);
      const end = Math.min(rows.length, range.y + range.height + 1);
      const ids: number[] = [];
      for (let i = start; i < end; i++) {
        const r = rows[i];
        if (r?.has_id_photo && cache.getUrl(r.id, "thumb") === undefined) {
          ids.push(r.id);
        }
      }
      if (!ids.length) return;
      void cache.requestUrls(ids, "thumb");
    },
    [rows, cache],
  );
}
