"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { cn } from "@/lib/utils";
import { ViewGrid as LayoutGrid, Table2Columns as Table2 } from "iconoir-react";

type GridViewToggleProps = {
  useGlideView: boolean;
  onToggle: () => void;
  className?: string;
};

export function GridViewToggle({
  useGlideView,
  onToggle,
  className,
}: GridViewToggleProps) {
  return (
    <Button
      type="button"
      variant={useGlideView ? "secondary" : "secondary"}
      size="sm"
      onClick={onToggle}
      className={cn(
        "gap-2 tracking-tight transition-transform active:scale-[0.98]",
        className,
      )}
    >
      {useGlideView ? (
        <>
          <Table2 className="size-4 shrink-0" aria-hidden />
          Revert to original
        </>
      ) : (
        <>
          <LayoutGrid className="size-4 shrink-0" aria-hidden />
          Try the new look
        </>
      )}
    </Button>
  );
}
