export type IdPhotoUrlVariant = "thumb" | "full";

export const ID_PHOTO_URL_BATCH_SIZE = 50;

const BATCH_SIZE = ID_PHOTO_URL_BATCH_SIZE;
const URL_TTL_MS = 55 * 60 * 1000;

type CacheEntry = {
  url: string | null;
  fetchedAt: number;
};

type VariantCache = Map<number, CacheEntry>;

export type FetchIdPhotoUrlsBatch = (
  userIds: number[],
  variant: IdPhotoUrlVariant,
) => Promise<Record<string, string | null>>;

export type IdPhotoUrlCache = {
  getUrl: (userId: number, variant: IdPhotoUrlVariant) => string | null | undefined;
  requestUrls: (
    userIds: number[],
    variant: IdPhotoUrlVariant,
  ) => Promise<void>;
  invalidate: (userId: number) => void;
};

function isFresh(entry: CacheEntry | undefined): entry is CacheEntry {
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < URL_TTL_MS;
}

export function createIdPhotoUrlCache(
  fetchBatch: FetchIdPhotoUrlsBatch,
): IdPhotoUrlCache {
  const caches: Record<IdPhotoUrlVariant, VariantCache> = {
    thumb: new Map(),
    full: new Map(),
  };
  const inflight = new Map<string, Promise<void>>();

  const getUrl = (userId: number, variant: IdPhotoUrlVariant) => {
    const entry = caches[variant].get(userId);
    return isFresh(entry) ? entry.url : undefined;
  };

  const requestUrls = async (userIds: number[], variant: IdPhotoUrlVariant) => {
    const cache = caches[variant];
    const missing = userIds.filter((id) => !isFresh(cache.get(id)));
    if (!missing.length) return;

    const chunks: number[][] = [];
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      chunks.push(missing.slice(i, i + BATCH_SIZE));
    }

    await Promise.all(
      chunks.map(async (chunk) => {
        const key = `${variant}:${chunk.join(",")}`;
        let pending = inflight.get(key);
        if (!pending) {
          pending = fetchBatch(chunk, variant)
            .then((urls) => {
              const now = Date.now();
              for (const id of chunk) {
                cache.set(id, {
                  url: urls[String(id)] ?? null,
                  fetchedAt: now,
                });
              }
            })
            .finally(() => {
              inflight.delete(key);
            });
          inflight.set(key, pending);
        }
        await pending;
      }),
    );
  };

  const invalidate = (userId: number) => {
    caches.thumb.delete(userId);
    caches.full.delete(userId);
  };

  return { getUrl, requestUrls, invalidate };
}
