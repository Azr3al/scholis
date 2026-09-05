import { describe, expect, it } from "vitest";
import {
  collectClipboardFiles,
  filterFilesForAttachments,
} from "./attachment-dropzone-files";

function makeFile(
  name: string,
  type: string,
  size = 10,
): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

describe("collectClipboardFiles", () => {
  it("returns empty array when clipboardData is null", () => {
    expect(collectClipboardFiles(null)).toEqual([]);
  });

  it("collects files from clipboardData.files", () => {
    const img = makeFile("shot.png", "image/png");
    const dt = {
      files: [img] as unknown as FileList,
      items: [] as unknown as DataTransferItemList,
    } as DataTransfer;
    Object.defineProperty(dt, "files", {
      value: {
        length: 1,
        item: (i: number) => (i === 0 ? img : null),
        [0]: img,
      },
    });
    Object.defineProperty(dt, "items", {
      value: { length: 0 },
    });
    expect(collectClipboardFiles(dt)).toEqual([img]);
  });

  it("collects files from clipboardData.items and dedupes by name+size", () => {
    const img = makeFile("shot.png", "image/png", 20);
    const item = {
      kind: "file",
      getAsFile: () => img,
    };
    const dt = {
      files: { length: 0, item: () => null },
      items: { length: 1, 0: item },
    } as unknown as DataTransfer;
    expect(collectClipboardFiles(dt)).toEqual([img]);
  });

  it("skips zero-size files", () => {
    const empty = makeFile("empty.png", "image/png", 0);
    const dt = {
      files: {
        length: 1,
        item: (i: number) => (i === 0 ? empty : null),
        0: empty,
      },
      items: { length: 0 },
    } as unknown as DataTransfer;
    expect(collectClipboardFiles(dt)).toEqual([]);
  });

  it("prefers clipboardData.files over items to avoid cross-source duplicates", () => {
    const fromFiles = makeFile("image.png", "image/png", 20);
    const fromItems = makeFile("clipboard.png", "image/png", 20);
    const item = {
      kind: "file",
      getAsFile: () => fromItems,
    };
    const dt = {
      files: {
        length: 1,
        item: (i: number) => (i === 0 ? fromFiles : null),
        0: fromFiles,
      },
      items: { length: 1, 0: item },
    } as unknown as DataTransfer;
    expect(collectClipboardFiles(dt)).toEqual([fromFiles]);
  });
});

describe("filterFilesForAttachments", () => {
  it("keeps images when isImageOnly", () => {
    const img = makeFile("a.png", "image/png");
    const pdf = makeFile("a.pdf", "application/pdf");
    const result = filterFilesForAttachments([img, pdf], {
      isImageOnly: true,
    });
    expect(result.accepted).toEqual([img]);
    expect(result.rejected.map((r) => r.file)).toEqual([pdf]);
  });

  it("uses isAllowedFileType when not image-only", () => {
    const img = makeFile("a.png", "image/png");
    const exe = makeFile("a.exe", "application/x-msdownload");
    const result = filterFilesForAttachments([img, exe], {
      isImageOnly: false,
    });
    expect(result.accepted).toEqual([img]);
    expect(result.rejected.map((r) => r.file)).toEqual([exe]);
  });

  it("respects remaining capacity", () => {
    const a = makeFile("a.png", "image/png");
    const b = makeFile("b.png", "image/png");
    const c = makeFile("c.png", "image/png");
    const result = filterFilesForAttachments([a, b, c], {
      isImageOnly: true,
      remainingSlots: 2,
    });
    expect(result.accepted).toEqual([a, b]);
    expect(result.skippedCount).toBe(1);
  });

  it("returns empty accepted when remainingSlots is 0", () => {
    const a = makeFile("a.png", "image/png");
    const result = filterFilesForAttachments([a], {
      isImageOnly: true,
      remainingSlots: 0,
    });
    expect(result.accepted).toEqual([]);
    expect(result.skippedCount).toBe(1);
  });
});
