import { describe, expect, it, vi } from "vitest";

const makeGetRequest = vi.fn();

vi.mock("@/app/client-api/utils", () => ({
  makeGetRequest: (...args: unknown[]) => makeGetRequest(...args),
  makePostRequest: vi.fn(),
}));

import { fetchCustomFieldAttachmentDownloadUrl } from "./attachment-api";

describe("fetchCustomFieldAttachmentDownloadUrl", () => {
  it("reads presigned url from nested API envelope", async () => {
    makeGetRequest.mockResolvedValue({
      data: {
        isError: false,
        message: "success",
        data: { url: "https://example.test/photo.jpg" },
      },
    });

    await expect(fetchCustomFieldAttachmentDownloadUrl(12)).resolves.toBe(
      "https://example.test/photo.jpg",
    );
    expect(makeGetRequest).toHaveBeenCalledWith(
      "custom-field-attachments/12/download-url",
    );
  });

  it("returns null when url is missing", async () => {
    makeGetRequest.mockResolvedValue({
      data: { isError: false, message: "success", data: {} },
    });

    await expect(fetchCustomFieldAttachmentDownloadUrl(12)).resolves.toBeNull();
  });
});
