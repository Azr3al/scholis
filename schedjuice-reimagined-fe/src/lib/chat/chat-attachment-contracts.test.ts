import { describe, expect, it } from "vitest";

import {
  isAudioOnlyChatAttachmentMessage,
  isChatAudioAttachment,
} from "@/lib/chat/chat-attachment-contracts";

describe("isAudioOnlyChatAttachmentMessage", () => {
  it("returns true when message has only audio attachments and no text", () => {
    expect(
      isAudioOnlyChatAttachmentMessage({
        text: "",
        attachments: [
          {
            attachment_id: 1,
            name: "voice.m4a",
            mime_type: "audio/mp4",
            size_bytes: 100,
          },
        ],
      })
    ).toBe(true);
  });

  it("returns false when text is present", () => {
    expect(
      isAudioOnlyChatAttachmentMessage({
        text: "listen to this",
        attachments: [
          {
            attachment_id: 1,
            name: "voice.m4a",
            mime_type: "audio/mp4",
            size_bytes: 100,
          },
        ],
      })
    ).toBe(false);
  });

  it("returns false when a non-audio attachment is included", () => {
    expect(
      isAudioOnlyChatAttachmentMessage({
        text: "",
        attachments: [
          {
            attachment_id: 1,
            name: "voice.m4a",
            mime_type: "audio/mp4",
            size_bytes: 100,
          },
          {
            attachment_id: 2,
            name: "photo.jpg",
            mime_type: "image/jpeg",
            size_bytes: 100,
          },
        ],
      })
    ).toBe(false);
  });
});

describe("isChatAudioAttachment", () => {
  it("detects audio by mime type", () => {
    expect(
      isChatAudioAttachment({
        name: "clip.dat",
        mime_type: "audio/webm",
      })
    ).toBe(true);
  });

  it("detects audio by file extension", () => {
    expect(
      isChatAudioAttachment({
        name: "voice.m4a",
        mime_type: "",
      })
    ).toBe(true);
  });
});
