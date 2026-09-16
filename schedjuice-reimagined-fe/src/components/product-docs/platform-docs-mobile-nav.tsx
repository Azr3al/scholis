"use client";
import { Sheet } from "@/components/primitives";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { PlatformDocsSidebar } from "./platform-docs-sidebar";

export function PlatformDocsMobileNav({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    onOpenChange(false);
  }, [pathname, onOpenChange]);

  return (
    <Sheet.Root open={open} onOpenChange={onOpenChange}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup side="left" className="w-[min(100vw,20rem)] overflow-y-auto">
        <div>
          <Sheet.Title>Product docs</Sheet.Title>
        </div>
        <div className="mt-6">
          <PlatformDocsSidebar />
        </div>
      </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
