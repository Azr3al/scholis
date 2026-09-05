import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import * as chatAttachments from "@/lib/chat/chat-attachments";
import { LeaveRequestAttachment } from "./leave-request-attachment";

vi.mock("@/components/course/chat/chat-attachment-renderer", () => ({
  ChatAttachmentRenderer: ({
    attachments,
  }: {
    attachments: Array<{ name: string; download_url?: string }>;
  }) => (
    <div data-testid="chat-attachment-renderer">
      {attachments.map((att) =>
        att.download_url?.includes(".png") ||
        att.name.endsWith(".png") ? (
          <img key={att.name} src={att.download_url} alt={att.name} />
        ) : (
          <a key={att.name} href={att.download_url}>
            {att.name}
          </a>
        ),
      )}
    </div>
  ),
}));

function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("LeaveRequestAttachment", () => {
  beforeEach(() => {
    vi.spyOn(chatAttachments, "resolveChatAttachmentsByIds");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows a loading skeleton while resolving", () => {
    vi.mocked(chatAttachments.resolveChatAttachmentsByIds).mockReturnValue(
      new Promise(() => {}),
    );

    const { container } = renderWithQuery(
      <LeaveRequestAttachment attachment={{ id: 9, filename: "note.pdf" }} />,
    );

    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it("renders an image preview when resolve returns an image ref", async () => {
    vi.mocked(chatAttachments.resolveChatAttachmentsByIds).mockResolvedValue([
      {
        attachment_id: 9,
        name: "doctor-note.png",
        mime_type: "image/png",
        size_bytes: 1024,
        download_url: "https://cdn.example.com/doctor-note.png",
      },
    ]);

    renderWithQuery(
      <LeaveRequestAttachment attachment={{ id: 9, filename: "doctor-note.png" }} />,
    );

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "doctor-note.png" })).toBeTruthy();
    });
  });

  it("renders an image preview from public_data when resolve omits download_url", async () => {
    vi.mocked(chatAttachments.resolveChatAttachmentsByIds).mockResolvedValue([
      {
        attachment_id: 9,
        name: "doctor-note.png",
        mime_type: "image/png",
        size_bytes: 1024,
      },
    ]);

    renderWithQuery(
      <LeaveRequestAttachment
        attachment={{
          id: 9,
          filename: "doctor-note.png",
          file_type: "image/png",
          public_data: "https://cdn.example.com/doctor-note.png",
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "doctor-note.png" })).toBeTruthy();
    });
  });

  it("renders an image preview from expanded attachment data when resolve fails", async () => {
    vi.mocked(chatAttachments.resolveChatAttachmentsByIds).mockRejectedValue(
      new Error("resolve failed"),
    );

    renderWithQuery(
      <LeaveRequestAttachment
        attachment={{
          id: 11,
          filename: "ayutthaya-collage.png",
          file_type: "image/png",
          data: "https://cdn.example.com/ayutthaya-collage.png",
        }}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("img", { name: "ayutthaya-collage.png" }),
      ).toBeTruthy();
    });
  });

  it("shows filename fallback when no download url is available", async () => {
    vi.mocked(chatAttachments.resolveChatAttachmentsByIds).mockResolvedValue([]);

    renderWithQuery(
      <LeaveRequestAttachment attachment={{ id: 10, filename: "doctor-note.pdf" }} />,
    );

    await waitFor(() => {
      expect(screen.getByText("doctor-note.pdf")).toBeTruthy();
    });
  });
});
