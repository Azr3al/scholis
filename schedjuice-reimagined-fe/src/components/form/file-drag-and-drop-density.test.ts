import { describe, expect, it } from "vitest";
import {
  fileDropzoneButtonWrapClassName,
  fileDropzoneIconClassName,
  fileDropzoneIconWrapClassName,
  fileDropzoneInnerClassName,
  fileDropzoneRootClassName,
} from "./file-drag-and-drop-density";

describe("file-drag-and-drop-density", () => {
  it("keeps large padding for default density", () => {
    const cls = fileDropzoneRootClassName("default");
    expect(cls).toContain("p-6");
    expect(cls).toContain("sm:p-8");
  });

  it("uses tighter padding for compact density", () => {
    const cls = fileDropzoneRootClassName("compact");
    expect(cls).toContain("p-3");
    expect(cls).toContain("sm:p-4");
    expect(cls).not.toContain("p-6");
    expect(cls).not.toContain("sm:p-8");
  });

  it("tightens inner gap, button margin, and icon size for compact", () => {
    expect(fileDropzoneInnerClassName("compact")).toContain("gap-2");
    expect(fileDropzoneInnerClassName("default")).toContain("gap-3");
    expect(fileDropzoneButtonWrapClassName("compact")).toContain("mt-2");
    expect(fileDropzoneButtonWrapClassName("default")).toContain("mt-4");
    expect(fileDropzoneIconWrapClassName("compact")).toContain("p-1.5");
    expect(fileDropzoneIconClassName("compact")).toContain("h-5");
    expect(fileDropzoneIconClassName("default")).toContain("h-6");
  });
});
