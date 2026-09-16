"use client";
import { Sheet } from "@/components/primitives";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { HelpSidebar } from "./help-sidebar";

export function HelpMobileNav({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    onOpenChange(false);
  }, [pathname]);

  return (
    <Sheet.Root open={open} onOpenChange={onOpenChange}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup side="left" className="w-[min(100vw,20rem)] overflow-y-auto">
        <div>
          <Sheet.Title>Help navigation</Sheet.Title>
        </div>
        <div className="mt-6">
          <HelpSidebar />
        </div>
      </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
