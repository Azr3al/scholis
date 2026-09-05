"use client";

import { cn } from "@/lib/utils";
import { parseAsString, useQueryState } from "nuqs";

const TABS = [{ id: "duplicates", label: "Potential duplicates" }] as const;

export function UserInsightsTabs({ className }: { className?: string }) {
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsString.withDefault("duplicates"),
  );

  return (
    <div className={cn("flex gap-2 border-b", className)}>
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => void setTab(item.id)}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab === item.id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function useUserInsightsTab() {
  const [tab] = useQueryState("tab", parseAsString.withDefault("duplicates"));
  return tab;
}
