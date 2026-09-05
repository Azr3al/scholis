import { describe, expect, it, vi } from "vitest";
import { createIdPhotoUrlCache } from "@/lib/id-photo-url-cache";

describe("createIdPhotoUrlCache", () => {
  it("dedupes concurrent requests for the same user", async () => {
    const fetchBatch = vi.fn().mockResolvedValue({ "1": "http://a" });
    const cache = createIdPhotoUrlCache(fetchBatch);
    await Promise.all([
      cache.requestUrls([1], "thumb"),
      cache.requestUrls([1], "thumb"),
    ]);
    expect(fetchBatch).toHaveBeenCalledTimes(1);
  });

  it("chunks requests over 50 ids", async () => {
    const fetchBatch = vi.fn().mockResolvedValue({ urls: {} });
    const cache = createIdPhotoUrlCache(fetchBatch);
    const ids = Array.from({ length: 75 }, (_, i) => i + 1);
    await cache.requestUrls(ids, "thumb");
    expect(fetchBatch).toHaveBeenCalledTimes(2);
  });

  it("invalidate clears cached urls", async () => {
    const fetchBatch = vi.fn().mockResolvedValue({ "1": "http://a" });
    const cache = createIdPhotoUrlCache(fetchBatch);
    await cache.requestUrls([1], "thumb");
    expect(cache.getUrl(1, "thumb")).toBe("http://a");
    cache.invalidate(1);
    expect(cache.getUrl(1, "thumb")).toBeUndefined();
  });
});
