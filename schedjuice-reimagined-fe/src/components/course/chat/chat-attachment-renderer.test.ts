import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChatAttachmentRenderer } from "@/components/course/chat/chat-attachment-renderer";
import type { ChatAttachmentRef } from "@/types/chat";

function audioAttachment(
  overrides: Partial<ChatAttachmentRef> = {}
): ChatAttachmentRef {
  return {
    attachment_id: 1,
    name: "voice.m4a",
    mime_type: "audio/mp4",
    size_bytes: 4096,
    download_url: "https://example.com/voice.m4a",
    ...overrides,
  };
}

function pdfAttachment(): ChatAttachmentRef {
  return {
    attachment_id: 2,
    name: "notes.pdf",
    mime_type: "application/pdf",
    size_bytes: 1024,
    download_url: "https://example.com/notes.pdf",
  };
}

describe("ChatAttachmentRenderer", () => {
  it("renders inline voice player for audio attachments", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ChatAttachmentRenderer, {
        attachments: [audioAttachment()],
        isMe: false,
      })
    );

    expect(markup).toContain('aria-label="Play voice message"');
    expect(markup).toContain("0:00 / 0:00");
    expect(markup).toContain('<audio src="https://example.com/voice.m4a"');
    expect(markup).not.toMatch(/>voice\.m4a</);
  });

  it("renders file row for non-audio attachments", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ChatAttachmentRenderer, {
        attachments: [pdfAttachment()],
        isMe: false,
      })
    );

    expect(markup).toContain("notes.pdf");
    expect(markup).not.toContain('aria-label="Play voice message"');
  });
});
