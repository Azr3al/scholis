import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock("@/components/images/image-lightbox", () => ({
  ImageLightbox: ({ imageUrl }: { imageUrl: string | null }) =>
    imageUrl ? <div data-testid="lightbox">{imageUrl}</div> : null,
}));

import { FeedPostAttachmentGallery } from "./feed-post-attachment-gallery";

describe("FeedPostAttachmentGallery", () => {
  it("renders file downloads as links and opens lightbox for images", async () => {
    const user = userEvent.setup();
    render(
      <FeedPostAttachmentGallery
        attachments={[
          {
            id: 1,
            filename: "notes.pdf",
            file: "https://cdn.example.com/notes.pdf",
          },
          {
            id: 2,
            filename: "photo.png",
            file: "https://cdn.example.com/photo.png",
          },
        ]}
      />,
    );

    const fileLink = screen.getByRole("link", { name: /notes\.pdf/i });
    expect(fileLink.getAttribute("href")).toBe("https://cdn.example.com/notes.pdf");
    expect(fileLink.getAttribute("target")).toBe("_blank");

    await user.click(screen.getByRole("button", { name: /photo\.png/i }));
    expect(screen.getByTestId("lightbox").textContent).toContain(
      "https://cdn.example.com/photo.png",
    );
  });
});
