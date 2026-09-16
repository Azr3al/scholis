import { beforeEach, describe, expect, it, vi } from "vitest";

const patchMock = vi.fn();

vi.mock("@/lib/api", () => ({
  axiosClient: {
    patch: (...args: unknown[]) => patchMock(...args),
  },
}));

describe("updateAwardCertificate", () => {
  beforeEach(() => {
    patchMock.mockReset();
    patchMock.mockResolvedValue({
      data: {
        data: {
          id: 9,
          title: 42,
          document: { kind: "award", background: { url: null } },
          background_url: "https://cdn.example/bg.png",
        },
      },
    });
  });

  it("PATCHes award-titles/:id/certificate with multipart background", async () => {
    const file = new File(["png"], "bg.png", { type: "image/png" });
    const { updateAwardCertificate } = await import("@/lib/awards-api");
    await updateAwardCertificate(42, {
      document: { kind: "award", background: { url: null } },
      background: file,
    });
    expect(patchMock).toHaveBeenCalledTimes(1);
    const [url, body] = patchMock.mock.calls[0];
    expect(url).toBe("award-titles/42/certificate");
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("background")).toBe(file);
    expect((body as FormData).has("name")).toBe(false);
  });
});
