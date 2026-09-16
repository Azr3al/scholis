"use client";

import { fetchIdPhotoUrls } from "@/app/client-api/id-photo-urls";
import {
  createIdPhotoUrlCache,
  type IdPhotoUrlCache,
} from "@/lib/id-photo-url-cache";
import { useCallback, useMemo, useRef, useState } from "react";

export type { IdPhotoUrlCache } from "@/lib/id-photo-url-cache";

export function useIdPhotoUrlCache() {
  const cacheRef = useRef<IdPhotoUrlCache | null>(null);
  if (!cacheRef.current) {
    cacheRef.current = createIdPhotoUrlCache(fetchIdPhotoUrls);
  }
  const [revision, setRevision] = useState(0);
  const bumpRevision = useCallback(() => setRevision((n) => n + 1), []);

  const requestUrls = useCallback(
    async (...args: Parameters<IdPhotoUrlCache["requestUrls"]>) => {
      await cacheRef.current!.requestUrls(...args);
      bumpRevision();
    },
    [bumpRevision],
  );

  const getUrl = useCallback(
    (...args: Parameters<IdPhotoUrlCache["getUrl"]>) =>
      cacheRef.current!.getUrl(...args),
    [revision],
  );

  const invalidate = useCallback(
    (userId: number) => {
      cacheRef.current!.invalidate(userId);
      bumpRevision();
    },
    [bumpRevision],
  );

  return useMemo(
    () => ({
      getUrl,
      requestUrls,
      invalidate,
      revision,
      bumpRevision,
    }),
    [getUrl, requestUrls, invalidate, revision, bumpRevision],
  );
}
