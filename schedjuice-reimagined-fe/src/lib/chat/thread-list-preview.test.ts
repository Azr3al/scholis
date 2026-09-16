import { describe, expect, it } from "vitest";

import { threadListPreviewText } from "@/lib/chat/thread-list-preview";

const labels = {
  noMessagesYet: "No messages yet",
  attachment: "Attachment",
  voiceMessage: "Voice message",
};

describe("threadListPreviewText", () => {
  it("returns plain text without author prefix", () => {
    expect(
      threadListPreviewText(
        {
          id: 1,
          created_at: "2026-01-01T00:00:00Z",
          user: { id: 9, name: "Admin @ hm552" },
          content: { text: "Hello", mentions: [], attachments: [] },
        },
        labels,
      ),
    ).toBe("Hello");
  });

  it("returns voice label for audio-only attachments", () => {
    expect(
      threadListPreviewText(
        {
          id: 2,
          created_at: "2026-01-01T00:00:00Z",
          user: { id: 9, name: "Teacher" },
          content: {
            text: "",
            mentions: [],
            attachments: [
              {
                attachment_id: 1,
                name: "voice.m4a",
                mime_type: "audio/mp4",
                size_bytes: 100,
              },
            ],
          },
        },
        labels,
      ),
    ).toBe("Voice message");
  });

  it("returns attachment label for non-audio attachments", () => {
    expect(
      threadListPreviewText(
        {
          id: 3,
          created_at: "2026-01-01T00:00:00Z",
          user: { id: 9, name: "Teacher" },
          content: {
            text: "",
            mentions: [],
            attachments: [
              {
                attachment_id: 2,
                name: "doc.pdf",
                mime_type: "application/pdf",
                size_bytes: 100,
              },
            ],
          },
        },
        labels,
      ),
    ).toBe("Attachment");
  });

  it("returns fallback when last message is missing", () => {
    expect(threadListPreviewText(null, labels)).toBe("No messages yet");
    expect(threadListPreviewText(undefined, labels)).toBe("No messages yet");
  });
});
