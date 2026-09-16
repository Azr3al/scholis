// src/components/primitives/sheet-overlay-registry.test.tsx
import { render, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  GlobalOverlayProvider,
  useGlobalOverlayActive,
} from "@/lib/ui/global-overlay-registry";
import { Sheet } from "./sheet";

function wrapper({ children }: { children: React.ReactNode }) {
  return <GlobalOverlayProvider>{children}</GlobalOverlayProvider>;
}

function OverlayProbe({ open }: { open: boolean }) {
  const active = useGlobalOverlayActive();
  return (
    <>
      <span data-testid="active">{active ? "yes" : "no"}</span>
      <Sheet.Root open={open}>
        <Sheet.Portal>
          <Sheet.Popup>Panel</Sheet.Popup>
        </Sheet.Portal>
      </Sheet.Root>
    </>
  );
}

describe("Sheet.Root global overlay registration", () => {
  it("registers while open", () => {
    const { getByTestId, rerender } = render(<OverlayProbe open={false} />, {
      wrapper,
    });

    expect(getByTestId("active").textContent).toBe("no");

    rerender(<OverlayProbe open={true} />);
    expect(getByTestId("active").textContent).toBe("yes");

    rerender(<OverlayProbe open={false} />);
    expect(getByTestId("active").textContent).toBe("no");
  });
});

describe("Sheet.Root without provider", () => {
  it("does not throw when global overlay provider is absent", () => {
    renderHook(() => useGlobalOverlayActive());
  });
});
