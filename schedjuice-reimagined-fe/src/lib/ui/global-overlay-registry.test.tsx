// src/lib/ui/global-overlay-registry.test.tsx
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  GlobalOverlayProvider,
  useGlobalOverlayActive,
  useRegisterGlobalOverlay,
} from "./global-overlay-registry";

function wrapper({ children }: { children: React.ReactNode }) {
  return <GlobalOverlayProvider>{children}</GlobalOverlayProvider>;
}

function useOverlayProbe(isOpen: boolean) {
  useRegisterGlobalOverlay(isOpen);
  return useGlobalOverlayActive();
}

describe("global overlay registry", () => {
  it("returns false when no overlays are registered", () => {
    const { result } = renderHook(() => useGlobalOverlayActive(), { wrapper });
    expect(result.current).toBe(false);
  });

  it("returns false after the overlay unregisters on cleanup", () => {
    const { result, rerender, unmount } = renderHook(
      ({ isOpen }) => useOverlayProbe(isOpen),
      { initialProps: { isOpen: true }, wrapper },
    );

    expect(result.current).toBe(true);

    rerender({ isOpen: false });
    expect(result.current).toBe(false);

    unmount();
    expect(result.current).toBe(false);
  });

  it("tracks multiple simultaneous overlays", () => {
    function useTwoOverlays(firstOpen: boolean, secondOpen: boolean) {
      useRegisterGlobalOverlay(firstOpen);
      useRegisterGlobalOverlay(secondOpen);
      return useGlobalOverlayActive();
    }

    const { result, rerender } = renderHook(
      ({ firstOpen, secondOpen }) => useTwoOverlays(firstOpen, secondOpen),
      { initialProps: { firstOpen: true, secondOpen: true }, wrapper },
    );

    expect(result.current).toBe(true);

    rerender({ firstOpen: false, secondOpen: true });
    expect(result.current).toBe(true);

    rerender({ firstOpen: false, secondOpen: false });
    expect(result.current).toBe(false);
  });
});
