import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cookies-next", () => ({
  getCookie: vi.fn((key: string) => (key === "access" ? "token" : "tenant")),
}));

import { mapJuiceBoxResponseToChatAttachmentRefs } from "@/lib/juicebox/map-rows";
import {
  buildChatAttachmentUrlMap,
  collectChatAttachmentIds,
  hydrateChatAttachmentRef,
  hydrateChatMessageAttachments,
} from "@/lib/chat/hydrate-chat-attachment-urls";
import { uploadChatAttachments } from "@/lib/chat/chat-attachments";
import { uploadToJuiceBoxMultipart } from "@/lib/juicebox/upload";

vi.mock("@/lib/juicebox/upload", () => ({
  uploadToJuiceBoxMultipart: vi.fn(),
}));

const mockUpload = vi.mocked(uploadToJuiceBoxMultipart);

describe("mapJuiceBoxResponseToChatAttachmentRefs", () => {
  it("returns empty array for legacy ok-only response", () => {
    expect(mapJuiceBoxResponseToChatAttachmentRefs({ ok: true })).toEqual([]);
  });

  it("maps public_data when resolve omits downloadUrl", () => {
    expect(
      mapJuiceBoxResponseToChatAttachmentRefs({
        attachments: [
          {
            id: 14,
            filename: "photo.png",
            file_type: "image/png",
            public_data: "https://cdn.example.com/photo.png",
          },
        ],
      }),
    ).toEqual([
      {
        attachment_id: 14,
        name: "photo.png",
        mime_type: "image/png",
        size_bytes: 0,
        download_url: "https://cdn.example.com/photo.png",
      },
    ]);
  });
});

describe("uploadChatAttachments", () => {
  beforeEach(() => {
    mockUpload.mockReset();
  });

  it("uploads via JuiceBox with chat table and foreignKey", async () => {
    mockUpload.mockResolvedValue({
      attachments: [
        {
          id: 11,
          filename: "doc.pdf",
          file_type: "application/pdf",
          size: 900,
          downloadUrl: "https://example.com/doc.pdf",
        },
      ],
    });

    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    const refs = await uploadChatAttachments([file], "42");

    expect(mockUpload).toHaveBeenCalledWith({
      files: [file],
      tableName: "chat",
      foreignKey: "42",
      isPublic: false,
      purge: false,
    });
    expect(refs[0]?.attachment_id).toBe(11);
  });

  it("throws when foreignKey is missing", async () => {
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    await expect(uploadChatAttachments([file], "")).rejects.toThrow(
      "foreignKey is required for attachment upload."
    );
  });

  it("rejects non-numeric foreignKey before upload", async () => {
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    await expect(uploadChatAttachments([file], "complaint-new-1")).rejects.toThrow(
      "foreignKey must be a numeric id for JuiceBox upload."
    );
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

describe("hydrateChatMessageAttachments", () => {
  it("collects unique attachment ids from messages", () => {
    const ids = collectChatAttachmentIds([
      {
        id: 1,
        user: 1,
        created_at: "2026-01-01T00:00:00Z",
        content: {
          text: "",
          attachments: [
            {
              attachment_id: 5,
              name: "a.pdf",
              mime_type: "application/pdf",
              size_bytes: 1,
            },
            {
              attachment_id: 5,
              name: "a.pdf",
              mime_type: "application/pdf",
              size_bytes: 1,
            },
          ],
        },
      },
    ]);

    expect(ids).toEqual([5]);
  });

  it("merges JuiceBox download_url onto message attachment refs", () => {
    const urlMap = buildChatAttachmentUrlMap([
      {
        attachment_id: 5,
        name: "photo.jpg",
        mime_type: "image/jpeg",
        size_bytes: 100,
        download_url: "https://signed.example/photo.jpg",
      },
    ]);

    const hydrated = hydrateChatMessageAttachments(
      {
        id: 1,
        user: 1,
        created_at: "2026-01-01T00:00:00Z",
        content: {
          text: "see attached",
          attachments: [
            {
              attachment_id: 5,
              name: "photo.jpg",
              mime_type: "image/jpeg",
              size_bytes: 100,
            },
          ],
        },
      },
      urlMap
    );

    expect(hydrated.content.attachments?.[0].download_url).toBe(
      "https://signed.example/photo.jpg"
    );
    expect(
      hydrateChatAttachmentRef(
        { attachment_id: 99, name: "x", mime_type: "application/pdf", size_bytes: 1 },
        urlMap
      ).download_url
    ).toBeUndefined();
    expect(
      hydrateChatAttachmentRef(
        {
          attachment_id: 5,
          name: "photo.jpg",
          mime_type: "image/jpeg",
          size_bytes: 100,
          download_url: "https://timeline.example/photo.jpg",
        },
        buildChatAttachmentUrlMap([
          {
            attachment_id: 5,
            name: "photo.jpg",
            mime_type: "image/jpeg",
            size_bytes: 100,
          },
        ]),
      ).download_url,
    ).toBe("https://timeline.example/photo.jpg");
  });
});
