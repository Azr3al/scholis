"use client";

import { Calendar } from "iconoir-react";
import { cn } from "@/lib/utils";
import type { Lead, LeadSource } from "@/types/lead";

export function LeadCardContent({
  lead,
  source,
  overlay = false,
}: {
  lead: Lead;
  source?: LeadSource;
  overlay?: boolean;
}) {
  const nextAppt = lead.appointments?.[0];

  return (
    <div
      className={cn(
        "w-full rounded-xl border border-border bg-surface-elevated p-3 text-left",
        overlay
          ? "rotate-2 cursor-grabbing border-border-strong shadow-lg"
          : "shadow-sm",
      )}
    >
      <div className="font-medium text-text-primary">{lead.name}</div>
      <div className="mt-0.5 text-xs text-text-secondary">
        {lead.interested_in || "—"}
        {source ? ` · ${source.name}` : ""}
      </div>
      {nextAppt && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-brand/10 px-1.5 py-0.5 font-mono text-xs text-text-secondary">
          <Calendar className="h-3 w-3" aria-hidden />
          {new Date(nextAppt.scheduled_at).toLocaleString()}
        </div>
      )}
    </div>
  );
}
