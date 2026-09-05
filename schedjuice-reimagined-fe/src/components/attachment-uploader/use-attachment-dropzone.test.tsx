import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  createTipTapImagePasteHandler,
  useAttachmentDropzone,
} from "./use-attachment-dropzone";

const toastAdd = vi.fn();

vi.mock("@/components/primitives", () => ({
  useToast: () => ({ add: toastAdd }),
}));

vi.mock("react-dropzone", () => ({
  useDropzone: (options: { onDrop: (files: File[]) => void }) => ({
    getRootProps: (props?: Record<string, unknown>) => props ?? {},
    getInputProps: () => ({}),
    isDragActive: false,
    open: vi.fn(),
    onDrop: options.onDrop,
  }),
}));

function makeFile(name: string, type: string, size = 10): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

function makeClipboardEvent(files: File[]): ClipboardEvent {
  const items = files.map((file) => ({
    kind: "file" as const,
    getAsFile: () => file,
  }));
  const fileList = {
    length: files.length,
    item: (i: number) => files[i] ?? null,
    ...Object.fromEntries(files.map((f, i) => [i, f])),
  };
  return {
    clipboardData: {
      files: fileList as unknown as FileList,
      items: {
        length: items.length,
        ...Object.fromEntries(items.map((it, i) => [i, it])),
      } as unknown as DataTransferItemList,
    },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
}

describe("useAttachmentDropzone onPaste", () => {
  it("accepts pasted PNG images", () => {
    toastAdd.mockClear();
    const setAttachments = vi.fn();
    const png = makeFile("shot.png", "image/png");

    const { result } = renderHook(() =>
      useAttachmentDropzone({
        attachments: [],
        setAttachments,
        maxFiles: 3,
        isImageOnly: false,
      }),
    );

    act(() => {
      result.current.onPaste(makeClipboardEvent([png]));
    });

    expect(setAttachments).toHaveBeenCalledWith([png]);
  });

  it("rejects pasted PDF when paste is image-only", () => {
    toastAdd.mockClear();
    const setAttachments = vi.fn();
    const pdf = makeFile("doc.pdf", "application/pdf");

    const { result } = renderHook(() =>
      useAttachmentDropzone({
        attachments: [],
        setAttachments,
        maxFiles: 3,
        isImageOnly: false,
      }),
    );

    act(() => {
      result.current.onPaste(makeClipboardEvent([pdf]));
    });

    expect(setAttachments).not.toHaveBeenCalled();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Images only" }),
    );
  });

  it("respects maxFiles for pasted images", () => {
    toastAdd.mockClear();
    const setAttachments = vi.fn();
    const first = makeFile("a.png", "image/png");
    const second = makeFile("b.png", "image/png");

    const { result } = renderHook(() =>
      useAttachmentDropzone({
        attachments: [first],
        setAttachments,
        maxFiles: 1,
        isImageOnly: false,
      }),
    );

    act(() => {
      result.current.onPaste(makeClipboardEvent([second]));
    });

    expect(setAttachments).not.toHaveBeenCalled();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Limit reached" }),
    );
  });
});

describe("createTipTapImagePasteHandler", () => {
  it("returns false when clipboard has no files", () => {
    const onPaste = vi.fn();
    const handler = createTipTapImagePasteHandler(onPaste);
    const event = {
      clipboardData: { files: { length: 0 }, items: { length: 0 } },
    } as unknown as ClipboardEvent;

    expect(handler(null, event)).toBe(false);
    expect(onPaste).not.toHaveBeenCalled();
  });

  it("delegates to onPaste when clipboard has files", () => {
    const onPaste = vi.fn();
    const handler = createTipTapImagePasteHandler(onPaste);
    const png = makeFile("shot.png", "image/png");
    const event = makeClipboardEvent([png]);

    expect(handler(null, event)).toBe(true);
    expect(onPaste).toHaveBeenCalledWith(event);
  });
});
