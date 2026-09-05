"use client";

import { Spinner } from "@/components/primitives/spinner";
import { PageContainer } from "@/components/layout/page-container";
import { axiosClient } from "@/lib/api";
import { CheckCircle as CheckCircle2, Refresh as RefreshCw, Terminal, XmarkCircle as XCircle } from "iconoir-react";
import { useEffect, useState } from "react";

type CronHealthResponse = {
  isError: boolean;
  jobs: { log_command_name: string }[];
};

type CronLog = {
  id: number;
  command_name: string;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  stdout: string;
  stderr: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function getDuration(start: string, end: string | null) {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusBadge({ status }: { status: CronLog["status"] }) {
  if (status === "RUNNING") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
        <Spinner className="h-3 w-3 " />
        RUNNING
      </span>
    );
  }
  if (status === "SUCCESS") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/30">
        <CheckCircle2 className="h-3 w-3" />
        SUCCESS
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-destructive/20 text-destructive border border-destructive/30">
      <XCircle className="h-3 w-3" />
      FAILED
    </span>
  );
}

function CollapsiblePre({
  content,
  className,
}: {
  content: string;
  className: string;
}) {
  const lines = content.split("\n");
  const isLong = lines.length > 5;
  const [expanded, setExpanded] = useState(!isLong);

  return (
    <div>
      <pre className={`${className} text-xs whitespace-pre-wrap break-all p-3`}>
        {expanded ? content : lines.slice(0, 5).join("\n") + "\n…"}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] text-muted-foreground hover:text-foreground mt-1"
        >
          {expanded ? "Hide" : `Show all (${lines.length} lines)`}
        </button>
      )}
    </div>
  );
}

export default function CronLogsPage() {
  const [commands, setCommands] = useState<string[]>([]);
  const [registryLoading, setRegistryLoading] = useState(true);
  const [selected, setSelected] = useState<string>("");
  const [logs, setLogs] = useState<CronLog[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRegistry() {
      setRegistryLoading(true);
      try {
        const { data } = await axiosClient.get<CronHealthResponse>(
          "management/cron-health"
        );
        if (cancelled) return;
        const names = (data.jobs ?? [])
          .map((j) => j.log_command_name)
          .sort((a, b) => a.localeCompare(b));
        setCommands(names);
        setSelected((prev) =>
          prev && names.includes(prev) ? prev : (names[0] ?? "")
        );
      } catch {
        if (!cancelled) {
          setCommands([]);
          setSelected("");
        }
      } finally {
        if (!cancelled) setRegistryLoading(false);
      }
    }

    void loadRegistry();
    return () => {
      cancelled = true;
    };
  }, []);


  const fetchLogs = async (commandName: string) => {
    setFetching(true);
    setFetched(false);
    try {
      const { data } = await axiosClient.get<{
        isError: boolean;
        logs: CronLog[];
      }>("management/cron-logs", {
        params: { command_name: commandName, limit: 10 },
      });
      setLogs(data.logs ?? []);
    } catch {
      setLogs([]);
    } finally {
      setFetching(false);
      setFetched(true);
    }
  };

  const handleSelect = (name: string) => {
    setSelected(name);
    setLogs([]);
    setFetched(false);
    fetchLogs(name);
  };

  return  (
<PageContainer width="wide" className="font-mono text-sm min-h-[70vh]">
      {/* Header */}
      <div className="border-b border-border pb-4 mb-6">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Terminal className="h-4 w-4" />
          <span>DEBUG / CRON LOGS</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          GET /api/v1/management/cron-logs
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Restricted to james@teachersucenter.com · JWT + X-Tenant required
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Command list */}
        <div className="border border-border">
          <div className="border-b border-border px-4 py-2 bg-muted/30">
            <span className="text-muted-foreground">CRON COMMANDS</span>
          </div>
          {registryLoading ? (
            <div className="px-4 py-6 flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="h-4 w-4 " />
              Loading…
            </div>
          ) : commands.length === 0 ? (
            <div className="px-4 py-6 text-xs text-muted-foreground">
              No commands returned.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {commands.map((name) => (
                <button
                  key={name}
                  onClick={() => handleSelect(name)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors ${
                    selected === name
                      ? "bg-muted/50 border-l-2 border-l-foreground -ml-px pl-[15px]"
                      : ""
                  }`}
                >
                  <span className="font-medium">{name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Log list */}
        <div className="lg:col-span-2 space-y-3">
          <div className="border border-border">
            <div className="border-b border-border px-4 py-2 bg-muted/30 flex items-center justify-between">
              <span className="text-muted-foreground">
                LOGS · {selected}
              </span>
              <button
                onClick={() => fetchLogs(selected)}
                disabled={fetching}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            </div>

            <div className="p-4">
              {fetching && (
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Spinner className="h-4 w-4 " />
                  Loading…
                </div>
              )}

              {!fetching && fetched && logs.length === 0 && (
                <p className="text-muted-foreground text-xs">No runs found.</p>
              )}

              {!fetching && !fetched && (
                <p className="text-muted-foreground text-xs">
                  Select a command to load logs.
                </p>
              )}
            </div>
          </div>

          {logs.map((log) => (
            <div key={log.id} className="border border-border">
              {/* Top row */}
              <div className="px-4 py-2 border-b border-border bg-muted/20 flex items-center gap-3 flex-wrap">
                <span className="text-xs text-muted-foreground">
                  #{log.id}
                </span>
                <span className="font-medium text-xs">{log.command_name}</span>
                <StatusBadge status={log.status} />
              </div>

              <div className="p-4 space-y-3">
                {/* Duration */}
                <div className="text-[10px] text-muted-foreground">
                  Started: {formatDate(log.created_at)} · Completed:{" "}
                  {formatDate(log.completed_at)} · Duration:{" "}
                  {getDuration(log.created_at, log.completed_at)}
                </div>

                {/* stdout */}
                {log.stdout && (
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">
                      stdout
                    </div>
                    <CollapsiblePre
                      content={log.stdout}
                      className="bg-muted/50 border border-border"
                    />
                  </div>
                )}

                {/* stderr */}
                {log.stderr && (
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">
                      stderr
                    </div>
                    <CollapsiblePre
                      content={log.stderr}
                      className="bg-destructive/10 border border-destructive/30"
                    />
                  </div>
                )}

                {/* error_message */}
                {log.error_message && (
                  <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 px-3 py-2 whitespace-pre-wrap break-all">
                    {log.error_message}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground flex gap-3">
                <span>Started: {formatDate(log.created_at)}</span>
                <span>Completed: {formatDate(log.completed_at)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageContainer>
);
}
