import { describe, expect, it } from "vitest";

import {
  leaveAttachmentToChatRef,
  mergeLeaveAttachmentDownloadUrl,
} from "./leave-attachment-ref";

describe("leaveAttachmentToChatRef", () => {
  it("maps expanded attachment fields to a chat ref", () => {
    expect(
      leaveAttachmentToChatRef({
        id: 7,
        filename: "note.png",
        file_type: "image/png",
        public_data: "https://cdn.example.com/note.png",
      }),
    ).toEqual({
      attachment_id: 7,
      name: "note.png",
      mime_type: "image/png",
      size_bytes: 0,
      download_url: "https://cdn.example.com/note.png",
    });
  });

  it("prefers public_data over data", () => {
    expect(
      leaveAttachmentToChatRef({
        id: 8,
        filename: "public.png",
        public_data: "https://cdn.example.com/public.png",
        data: "https://cdn.example.com/private.png",
      }).download_url,
    ).toBe("https://cdn.example.com/public.png");
  });
});

describe("mergeLeaveAttachmentDownloadUrl", () => {
  it("keeps public_data when Juice Box resolve omits download_url", () => {
    const base = leaveAttachmentToChatRef({
      id: 14,
      filename: "ayutthaya-collage.png",
      file_type: "image/png",
      public_data: "https://cdn.example.com/ayutthaya-collage.png",
    });

    expect(
      mergeLeaveAttachmentDownloadUrl(base, [
        {
          attachment_id: 14,
          name: "ayutthaya-collage.png",
          mime_type: "image/png",
          size_bytes: 0,
        },
      ]).download_url,
    ).toBe("https://cdn.example.com/ayutthaya-collage.png");
  });

  it("prefers Juice Box presigned URL over expanded attachment data", () => {
    const base = leaveAttachmentToChatRef({
      id: 14,
      filename: "note.png",
      public_data: "https://cdn.example.com/stale.png",
    });

    expect(
      mergeLeaveAttachmentDownloadUrl(base, [
        {
          attachment_id: 14,
          name: "note.png",
          mime_type: "image/png",
          size_bytes: 0,
          download_url: "https://cdn.example.com/presigned.png?sig=1",
        },
      ]).download_url,
    ).toBe("https://cdn.example.com/presigned.png?sig=1");
  });
});
