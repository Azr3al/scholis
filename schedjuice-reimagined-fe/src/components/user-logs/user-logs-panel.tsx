"use client";
import { Button } from "@/components/primitives";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import { fetchUserLogs } from "@/lib/user-logs-api";
import type { LogEntry } from "@/types/user-log";
import { NewLogDialog } from "./new-log-dialog";
import { LogEntryDetail } from "./log-entry-detail";

export function UserLogsPanel({
  userId,
  subjectRoles,
}: {
  userId: number;
  subjectRoles: string[];
}) {
  const { can } = usePermissions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [active, setActive] = useState<LogEntry | null>(null);
  const { data = [], refetch } = useQuery({
    queryKey: ["user-logs", userId],
    queryFn: () => fetchUserLogs(userId),
  });

  if (active) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setActive(null)}>
          ← Back to logs
        </Button>
        <LogEntryDetail entry={active} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Logs</h3>
        {can("userlog.create") && (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            + New log
          </Button>
        )}
      </div>
      <ul className="divide-y rounded-md border">
        {data.map((e) => {
          const rt = typeof e.report_type === "object" ? e.report_type : null;
          return (
            <li key={e.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
                onClick={() => setActive(e)}
              >
                {rt && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: rt.color }}
                  />
                )}
                <span className="flex-1 truncate text-sm">{e.title}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleDateString()}
                </span>
              </button>
            </li>
          );
        })}
        {data.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            No logs yet.
          </li>
        )}
      </ul>
      <NewLogDialog
        userId={userId}
        subjectRoles={subjectRoles}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => refetch()}
      />
    </div>
  );
}
