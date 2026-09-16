"use client";
import { Switch } from "@/components/primitives";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchLogTimeline } from "@/lib/user-logs-api";
import { filterTimeline } from "@/lib/user-logs/timeline";

const LABEL: Record<string, string> = {
  created: "created this log",
  edited: "edited this log",
  deleted: "deleted this log",
};

export function LogAuditTrail({ entryId }: { entryId: number }) {
  const [showDetail, setShowDetail] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["log-timeline", entryId],
    queryFn: () => fetchLogTimeline(entryId),
  });
  const items = filterTimeline(data, showDetail);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Activity</h4>
        <div className="flex items-center gap-2">
          <Switch
            id={`show-detail-${entryId}`}
            checked={showDetail}
            onCheckedChange={setShowDetail}
          />
          <label
            htmlFor={`show-detail-${entryId}`}
            className="text-xs text-muted-foreground"
          >
            Show detailed changes
          </label>
        </div>
      </div>
      <ol className="space-y-2">
        {items.map((e) => (
          <li key={e.id} className="text-sm">
            <span className="font-medium">{e.actor?.name ?? "Someone"}</span>{" "}
            <span className="text-muted-foreground">
              {LABEL[e.event_type] ?? e.event_type}
              {e.payload?.changed
                ? ` (${(e.payload.changed as string[]).join(", ")})`
                : ""}
            </span>
            <div className="text-[11px] text-muted-foreground">
              {new Date(e.created_at).toLocaleString()}
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">No activity.</p>
        )}
      </ol>
    </div>
  );
}
