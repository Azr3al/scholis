"use client";

import { NavArrowDown as ChevronDown, NavArrowRight as ChevronRight } from "iconoir-react";
import { useState } from "react";

import type { DemoArtifactSource } from "@/types/demo-artifacts";

export function SourcePanel({
  label = "View source",
  source,
}: {
  label?: string;
  source?: DemoArtifactSource | null;
}) {
  const [open, setOpen] = useState(false);
  if (!source?.content) return null;

  return (
    <div className="border border-border mt-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">({source.format})</span>
      </button>
      {open ? (
        <pre className="overflow-x-auto border-t border-border p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
          {source.content}
        </pre>
      ) : null}
    </div>
  );
}
