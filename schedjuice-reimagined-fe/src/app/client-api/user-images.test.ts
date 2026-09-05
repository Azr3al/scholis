import { beforeEach, describe, expect, it, vi } from "vitest";

const postMock = vi.fn();

vi.mock("@/lib/api", () => ({
  axiosClient: {
    post: (...args: unknown[]) => postMock(...args),
  },
}));

describe("fetchUserImageUrls", () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue({
      data: {
        data: {
          urls: { "7": "https://cdn.example/award-7.jpg" },
          sources: { "7": "user_image" },
        },
      },
    });
  });

  it("posts user_ids and image_type to batch URL endpoint", async () => {
    const { fetchUserImageUrls } = await import("@/app/client-api/user-images");
    const result = await fetchUserImageUrls([7], "award_image");
    expect(result.urls).toEqual({ "7": "https://cdn.example/award-7.jpg" });
    expect(result.sources).toEqual({ "7": "user_image" });
    expect(postMock).toHaveBeenCalledWith("user-image-urls", {
      user_ids: [7],
      image_type: "award_image",
    });
  });
});

describe("uploadUserImage", () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue({
      data: { data: { id: 1, image_type: "award_image" } },
    });
  });

  it("includes course_id in multipart upload when provided", async () => {
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const { uploadUserImage } = await import("@/app/client-api/user-images");
    await uploadUserImage(7, "award_image", file, { courseId: 42 });
    const [, body] = postMock.mock.calls[0];
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("course_id")).toBe("42");
  });
});
