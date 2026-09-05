import { beforeEach, describe, expect, it, vi } from "vitest";
import { ID_PHOTO_URL_BATCH_SIZE } from "@/lib/id-photo-url-cache";

const makePostRequest = vi.fn();

vi.mock("@/app/client-api/utils", () => ({
  makePostRequest: (...args: unknown[]) => makePostRequest(...args),
}));

describe("fetchIdPhotoUrlsBatched", () => {
  beforeEach(() => {
    makePostRequest.mockReset();
    makePostRequest.mockImplementation(async (_url: string, body: { user_ids: number[] }) => {
      const urls: Record<string, string | null> = {};
      for (const id of body.user_ids) {
        urls[String(id)] = `https://cdn.example/id-${id}.jpg`;
      }
      return { data: { data: { urls } } };
    });
  });

  it("returns empty object for no ids", async () => {
    const { fetchIdPhotoUrlsBatched } = await import("@/app/client-api/id-photo-urls");
    await expect(fetchIdPhotoUrlsBatched([], "full")).resolves.toEqual({});
    expect(makePostRequest).not.toHaveBeenCalled();
  });

  it("never sends more than ID_PHOTO_URL_BATCH_SIZE ids per request", async () => {
    const { fetchIdPhotoUrlsBatched } = await import("@/app/client-api/id-photo-urls");
    const userIds = Array.from({ length: 120 }, (_, i) => i + 1);

    await fetchIdPhotoUrlsBatched(userIds, "full");

    expect(makePostRequest).toHaveBeenCalledTimes(3);
    for (const call of makePostRequest.mock.calls) {
      const body = call[1] as { user_ids: number[] };
      expect(body.user_ids.length).toBeLessThanOrEqual(ID_PHOTO_URL_BATCH_SIZE);
    }
    const lastBody = makePostRequest.mock.calls[2]![1] as { user_ids: number[] };
    expect(lastBody.user_ids).toHaveLength(20);
  });

  it("merges url maps from all chunks", async () => {
    const { fetchIdPhotoUrlsBatched } = await import("@/app/client-api/id-photo-urls");
    const userIds = [1, 2, 55, 56];

    const merged = await fetchIdPhotoUrlsBatched(userIds, "thumb");

    expect(merged).toEqual({
      "1": "https://cdn.example/id-1.jpg",
      "2": "https://cdn.example/id-2.jpg",
      "55": "https://cdn.example/id-55.jpg",
      "56": "https://cdn.example/id-56.jpg",
    });
    expect(makePostRequest).toHaveBeenCalledTimes(1);
    const body = makePostRequest.mock.calls[0]![1] as { variant: string };
    expect(body.variant).toBe("thumb");
  });
});
