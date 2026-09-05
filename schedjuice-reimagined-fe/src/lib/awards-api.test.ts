import { beforeEach, describe, expect, it, vi } from "vitest";

const patchMock = vi.fn();

vi.mock("@/lib/api", () => ({
  axiosClient: {
    patch: (...args: unknown[]) => patchMock(...args),
  },
}));

describe("updateAwardTemplate", () => {
  beforeEach(() => {
    patchMock.mockReset();
    patchMock.mockResolvedValue({
      data: {
        data: {
          id: 9,
          document: { kind: "award", background: { url: null } },
          background_url: "https://cdn.example/bg.png",
        },
      },
    });
  });

  it("sends a selected background file as multipart, not JSON", async () => {
    const file = new File(["png"], "bg.png", { type: "image/png" });
    const { updateAwardTemplate } = await import("@/lib/awards-api");
    await updateAwardTemplate(9, {
      name: "May",
      document: { kind: "award", background: { url: null } },
      background: file,
    });
    expect(patchMock).toHaveBeenCalledTimes(1);
    const [, body] = patchMock.mock.calls[0];
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("background")).toBe(file);
    expect((body as FormData).get("name")).toBe("May");
  });
});
