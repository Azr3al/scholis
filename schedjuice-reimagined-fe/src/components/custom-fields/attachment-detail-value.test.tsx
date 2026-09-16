import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AttachmentDetailValue } from "./attachment-detail-value";

const fetchCustomFieldAttachmentDownloadUrl = vi.fn();
const imageLightboxProps = vi.fn();

vi.mock("@/lib/custom-fields/attachment-api", () => ({
  fetchCustomFieldAttachmentDownloadUrl: (...args: unknown[]) =>
    fetchCustomFieldAttachmentDownloadUrl(...args),
}));

vi.mock("@/components/images/image-lightbox", () => ({
  ImageLightbox: (props: {
    imageUrl: string | null;
    title?: string;
    onClose: () => void;
  }) => {
    imageLightboxProps(props);
    return props.imageUrl ? (
      <div data-testid="image-lightbox">{props.title}</div>
    ) : null;
  },
}));

describe("AttachmentDetailValue", () => {
  beforeEach(() => {
    fetchCustomFieldAttachmentDownloadUrl.mockReset();
    imageLightboxProps.mockReset();
    vi.stubGlobal("open", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens ImageLightbox when an image attachment is clicked", async () => {
    fetchCustomFieldAttachmentDownloadUrl.mockResolvedValue(
      "https://example.test/photo.jpg",
    );

    render(
      <AttachmentDetailValue
        value={[{ id: 11, filename: "photo.jpg", mime: "image/jpeg" }]}
      />,
    );

    await waitFor(() => {
      expect(fetchCustomFieldAttachmentDownloadUrl).toHaveBeenCalledWith(11);
    });

    await userEvent.click(
      screen.getByRole("button", { name: /photo\.jpg/i }),
    );

    await waitFor(() => {
      expect(imageLightboxProps).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: "https://example.test/photo.jpg",
          title: "photo.jpg",
        }),
      );
    });
    expect(screen.getByTestId("image-lightbox")).toBeTruthy();
    expect(window.open).not.toHaveBeenCalled();
  });

  it("opens PDF attachments in a new tab instead of the lightbox", async () => {
    fetchCustomFieldAttachmentDownloadUrl.mockResolvedValue(
      "https://example.test/invoice.pdf",
    );

    render(
      <AttachmentDetailValue
        value={[
          { id: 22, filename: "SDEC Invoice Aug.pdf", mime: "application/pdf" },
        ]}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /SDEC Invoice Aug\.pdf/i }),
    );

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith(
        "https://example.test/invoice.pdf",
        "_blank",
        "noopener,noreferrer",
      );
    });
    expect(screen.queryByTestId("image-lightbox")).toBeNull();
  });

  it("skips malformed rows without crashing", () => {
    render(
      <AttachmentDetailValue
        value={[{ filename: "orphan.pdf" }, { id: 5, filename: "note.pdf" }]}
      />,
    );

    expect(screen.getByRole("button", { name: /note\.pdf/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /orphan\.pdf/i })).toBeNull();
  });
});
