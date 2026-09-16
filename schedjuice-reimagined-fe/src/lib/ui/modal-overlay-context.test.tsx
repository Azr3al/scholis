// src/lib/ui/modal-overlay-context.test.tsx
import { renderHook } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  useDropdownPositionerClassName,
  wrapWithModalOverlay,
} from "./modal-overlay-context";

describe("useDropdownPositionerClassName", () => {
  it("uses dropdown layer outside modals", () => {
    const { result } = renderHook(() => useDropdownPositionerClassName());
    expect(result.current).toContain("z-dropdown");
    expect(result.current).not.toContain("z-modal-dropdown");
  });

  it("uses modalDropdown layer inside dialog/sheet roots", () => {
    const { result } = renderHook(() => useDropdownPositionerClassName(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        wrapWithModalOverlay(children) as ReactElement,
    });
    expect(result.current).toContain("z-modal-dropdown");
    expect(result.current).not.toContain("z-dropdown");
  });
});
