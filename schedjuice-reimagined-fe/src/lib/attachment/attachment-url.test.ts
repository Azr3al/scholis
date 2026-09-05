import { describe, expect, it } from "vitest";

import {
  getAttachmentUrl,
  isAttachmentImage,
} from "./attachment-url";

describe("getAttachmentUrl", () => {

  it("returns data when public_data missing", () => {
    expect(getAttachmentUrl({ data: "https://a.com/y.jpg" })).toBe(
      "https://a.com/y.jpg",
    );
  });

  it("returns file field for AnnouncementAttachment shape", () => {
    expect(
      getAttachmentUrl({ file: "https://cdn.example.com/announcement/a.png" }),
    ).toBe("https://cdn.example.com/announcement/a.png");
  });

  it("returns empty string when no url fields", () => {
    expect(getAttachmentUrl({})).toBe("");
  });
});

describe("isAttachmentImage", () => {
  it("detects via filename extension", () => {
    expect(isAttachmentImage({ filename: "photo.jpeg" })).toBe(true);
  });

  it("detects via file_type", () => {
    expect(isAttachmentImage({ file_type: "image/png" })).toBe(true);
  });
});
