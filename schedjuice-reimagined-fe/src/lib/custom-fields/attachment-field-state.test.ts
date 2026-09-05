import { describe, expect, it } from "vitest";

import {
  isImageDetailRow,
  mergeDoneFilesFromValue,
  parseAttachmentDetailRows,
  parseDoneFiles,
  toFormAttachmentValue,
} from "./attachment-field-state";

describe("attachment field preview state", () => {
  it("toFormAttachmentValue keeps filename for form round-trip", () => {
    const out = toFormAttachmentValue([
      {
        id: 9,
        filename: "photo.jpg",
        size: 1200,
        mime: "image/jpeg",
        downloadUrl: "https://example.test/photo.jpg",
      },
    ]);
    expect(out).toEqual([
      {
        id: 9,
        filename: "photo.jpg",
        size: 1200,
        mime: "image/jpeg",
        file_type: "image/jpeg",
        download_url: "https://example.test/photo.jpg",
      },
    ]);
  });

  it("mergeDoneFilesFromValue preserves filename when value is id-only", () => {
    const prev = [
      {
        id: 9,
        filename: "photo.jpg",
        size: 1200,
        mime: "image/jpeg",
        downloadUrl: "https://example.test/photo.jpg",
      },
    ];
    const merged = mergeDoneFilesFromValue(prev, [{ id: 9 }]);
    expect(merged[0]?.filename).toBe("photo.jpg");
    expect(merged[0]?.downloadUrl).toBe("https://example.test/photo.jpg");
  });

  it("parseDoneFiles falls back to File #id label", () => {
    expect(parseDoneFiles([{ id: 4 }])).toEqual([
      expect.objectContaining({ id: 4, filename: "File #4" }),
    ]);
  });

  it("parseAttachmentDetailRows normalizes mime from file_type", () => {
    expect(
      parseAttachmentDetailRows([
        { id: 1, filename: "photo.jpg", file_type: "image/jpeg" },
        { id: 2, filename: "invoice.pdf", mime: "application/pdf" },
      ]),
    ).toEqual([
      { id: 1, filename: "photo.jpg", mime: "image/jpeg" },
      { id: 2, filename: "invoice.pdf", mime: "application/pdf" },
    ]);
  });

  it("parseAttachmentDetailRows falls back to File #id when filename missing", () => {
    expect(parseAttachmentDetailRows([{ id: 7 }])).toEqual([
      { id: 7, filename: "File #7", mime: undefined },
    ]);
  });

  it("isImageDetailRow detects images from mime or extension", () => {
    expect(
      isImageDetailRow({ id: 1, filename: "x.bin", mime: "image/jpeg" }),
    ).toBe(true);
    expect(
      isImageDetailRow({ id: 2, filename: "56f57753cde58055867b7a4aa32a8612.jpg" }),
    ).toBe(true);
    expect(
      isImageDetailRow({ id: 3, filename: "SDEC Invoice Aug.pdf", mime: "application/pdf" }),
    ).toBe(false);
    expect(isImageDetailRow({ id: 4, filename: "File #4" })).toBe(false);
  });
});
