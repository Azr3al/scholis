"use client";

import { Spinner } from "@/components/primitives/spinner";
import { PageContainer } from "@/components/layout/page-container";
import { Input } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import { axiosClient } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCookie } from "cookies-next";
import { WarningTriangle as AlertTriangle, CheckCircle as CheckCircle2, Clock, Play, Refresh as RefreshCw, Terminal, XmarkCircle as XCircle } from "iconoir-react";
import { Badge } from "@/app/_chrome/badge";
import { useEffect, useState } from "react";

type CronHealthJob = {
  schedule_name: string;
  log_command_name: string;
  description: string;
  triggerable: boolean;
  status: "healthy" | "failed" | "missed" | "stuck" | "unknown";
  last_run_at: string | null;
  last_duration_seconds: number | null;
  next_expected_at: string | null;
  last_log_id: number | null;
};

type CronHealthResponse = {
  isError: boolean;
  message: string;
  scheduler: {
    qcluster_alive: boolean;
    schedules_registered: number;
    schedules_expected: number;
    meta_check_ran_at: string | null;
    overall: "healthy" | "degraded" | "down";
  };
  discord: {
    source: "db" | "env" | "none";
    configured: boolean;
    webhook_preview: string;
  };
  checked_at: string;
  jobs: CronHealthJob[];
  summary: Record<string, number>;
};

type DiscordStatus = CronHealthResponse["discord"];

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

type TriggerResponse = {
  isError: boolean;
  message: string;
  log?: CronLog;
  details?: string;
};

async function fetchCronHealth(): Promise<CronHealthResponse> {
  const { data } = await axiosClient.get<CronHealthResponse>("management/cron-health");
  return data;
}

function CronPostBadge() {
  return (
    <Badge
      variant="outline"
      className="font-mono font-normal text-[10px] px-1.5 py-0 h-5 shrink-0"
    >
      POST
    </Badge>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function getDuration(start: string, end: string | null) {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return `${(ms / 1000).toFixed(1)}s`;
}

function JobHealthBadge({ status }: { status: CronHealthJob["status"] }) {
  if (status === "healthy") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/30">
        <CheckCircle2 className="h-3 w-3" />
        HEALTHY
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-destructive/20 text-destructive border border-destructive/30">
        <XCircle className="h-3 w-3" />
        FAILED
      </span>
    );
  }
  if (status === "missed" || status === "stuck") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
        <AlertTriangle className="h-3 w-3" />
        {status.toUpperCase()}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border">
      UNKNOWN
    </span>
  );
}

function TriggerLogStatusBadge({ status }: { status: CronLog["status"] }) {
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

function DiscordSourceBadge({ source }: { source: DiscordStatus["source"] }) {
  const label = source === "db" ? "DB" : source === "env" ? "ENV" : "NONE";
  const className =
    source === "db"
      ? "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30"
      : source === "env"
        ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium border ${className}`}
    >
      {label}
    </span>
  );
}

function SchedulerBanner({ scheduler }: { scheduler: CronHealthResponse["scheduler"] }) {
  const bannerClass =
    scheduler.overall === "healthy"
      ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400"
      : scheduler.overall === "degraded"
        ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
        : "bg-destructive/10 border-destructive/30 text-destructive";

  return (
    <div className={`border px-4 py-3 mb-4 ${bannerClass}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium uppercase tracking-wide text-xs">
          Scheduler · {scheduler.overall}
        </span>
        <span className="text-[10px] opacity-80">
          qcluster {scheduler.qcluster_alive ? "alive" : "down"} · schedules{" "}
          {scheduler.schedules_registered}/{scheduler.schedules_expected}
        </span>
      </div>
      {scheduler.meta_check_ran_at && (
        <p className="text-[10px] mt-1 opacity-80">
          Meta health check last ran: {formatDate(scheduler.meta_check_ran_at)}
        </p>
      )}
    </div>
  );
}

function DiscordOpsCard({
  discord,
  onUpdated,
}: {
  discord: DiscordStatus;
  onUpdated: () => void;
}) {
  const toast = useToast();
  const [webhookInput, setWebhookInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const saveWebhook = async (url: string) => {
    setSaving(true);
    try {
      await axiosClient.put("management/ops-discord", { webhook_url: url });
      setWebhookInput("");
      toast.add({ title: url ? "Webhook saved" : "DB override cleared" });
      onUpdated();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { details?: string; message?: string } } };
      toast.add({
        title: "Save failed",
        description: ax.response?.data?.details ?? ax.response?.data?.message ?? String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const testSend = async () => {
    setTesting(true);
    try {
      const { data } = await axiosClient.post<{ isError: boolean; sent?: boolean; error?: string }>(
        "management/ops-discord/test",
        {}
      );
      if (data.isError || !data.sent) {
        toast.add({
          title: "Test send failed",
          description: data.error ?? "Unknown error",
        });
      } else {
        toast.add({ title: "Test message sent" });
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string; details?: string } } };
      toast.add({
        title: "Test send failed",
        description: ax.response?.data?.error ?? ax.response?.data?.details ?? String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="border border-border mb-6">
      <div className="border-b border-border px-4 py-2 bg-muted/30 flex items-center justify-between">
        <span className="text-muted-foreground">DISCORD OPS ALERTS</span>
        <DiscordSourceBadge source={discord.source} />
      </div>
      <div className="p-4 space-y-3">
        <div className="text-xs">
          <span className="text-muted-foreground">Webhook: </span>
          <span className="text-foreground">
            {discord.webhook_preview || "— not configured —"}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          DB override takes precedence. When empty, falls back to DISCORD_WEBHOOK_URL env var.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            type="password"
            placeholder="https://discord.com/api/webhooks/…"
            value={webhookInput}
            onChange={(e) => setWebhookInput(e.target.value)}
            className="font-mono text-xs max-w-md h-8"
          />
          <button
            onClick={() => saveWebhook(webhookInput.trim())}
            disabled={saving || !webhookInput.trim()}
            className="px-3 py-1.5 text-xs bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Spinner className="h-3 w-3 " /> : "Save"}
          </button>
          {discord.source === "db" && (
            <button
              onClick={() => saveWebhook("")}
              disabled={saving}
              className="px-3 py-1.5 text-xs border border-border hover:bg-muted/50 disabled:opacity-50"
            >
              Clear override
            </button>
          )}
          <button
            onClick={testSend}
            disabled={testing || !discord.configured}
            className="px-3 py-1.5 text-xs border border-border hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? <Spinner className="h-3 w-3 " /> : "Test send"}
          </button>
        </div>
      </div>
    </div>
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

export default function CronJobsPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string>("");
  const [response, setResponse] = useState<TriggerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [isConflict, setIsConflict] = useState(false);

  const schema = getCookie("schema");
  const token = getCookie("access");

  const {
    data: health,
    isLoading: healthLoading,
    isFetching: healthFetching,
    refetch: refetchHealth,
  } = useQuery({
    queryKey: ["cron-health"],
    queryFn: fetchCronHealth,
    enabled: true,
    refetchInterval: 30_000,
  });

  const jobs = health?.jobs ?? [];

  useEffect(() => {
    if (jobs.length === 0) return;
    if (!selected || !jobs.some((j) => j.log_command_name === selected)) {
      setSelected(jobs[0].log_command_name);
    }
  }, [jobs, selected]);


  const selectedJob = jobs.find((j) => j.log_command_name === selected);

  const runCron = async () => {
    if (!selectedJob?.triggerable) return;
    setLoading(true);
    setResponse(null);
    setIsConflict(false);
    try {
      const { data } = await axiosClient.post<TriggerResponse>(
        `management/cron-trigger/${selected}`,
        {}
      );
      setResponse(data);
      void refetchHealth();
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: TriggerResponse } };
      if (ax.response?.status === 409) {
        setIsConflict(true);
      }
      setResponse(
        ax.response?.data ?? {
          isError: true,
          message: "Request failed",
          details: String(err),
        }
      );
    } finally {
      setLoading(false);
    }
  };

  const log = response?.log;

  return (
    <PageContainer width="wide" className="font-mono text-sm min-h-[70vh]">
      {/* Header */}
      <div className="border-b border-border pb-4 mb-6">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Terminal className="h-4 w-4" />
          <span>DEBUG / CRON JOBS</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          POST /api/v1/management/cron-trigger/&lt;command&gt;
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Restricted to james@teachersucenter.com · JWT + X-Tenant required
        </p>
      </div>

      {healthLoading && !health ? (
        <div className="flex items-center gap-2 text-muted-foreground mb-6">
          <Spinner className="h-4 w-4 " /> Loading cron health…
        </div>
      ) : health ? (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-foreground">
              Checked {formatDate(health.checked_at)}
              {healthFetching && !healthLoading ? " · refreshing…" : ""}
            </span>
            <button
              onClick={() => void refetchHealth()}
              disabled={healthFetching}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${healthFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          <SchedulerBanner scheduler={health.scheduler} />

          <DiscordOpsCard
            discord={health.discord}
            onUpdated={() => void queryClient.invalidateQueries({ queryKey: ["cron-health"] })}
          />

          {health.summary && (
            <div className="flex flex-wrap gap-2 mb-4 text-[10px] text-muted-foreground">
              {Object.entries(health.summary).map(([key, count]) => (
                <span key={key} className="border border-border px-2 py-0.5">
                  {key}: {count}
                </span>
              ))}
            </div>
          )}
        </>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Job list */}
        <div className="border border-border">
          <div className="border-b border-border px-4 py-2 bg-muted/30">
            <span className="text-muted-foreground">CRON JOBS</span>
          </div>
          {jobs.length === 0 ? (
            <div className="px-4 py-6 text-xs text-muted-foreground">
              {healthLoading ? "Loading…" : "No jobs returned."}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {jobs.map((job) => (
                <button
                  key={job.log_command_name}
                  onClick={() => {
                    setSelected(job.log_command_name);
                    setResponse(null);
                    setIsConflict(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors ${
                    selected === job.log_command_name
                      ? "bg-muted/50 border-l-2 border-l-foreground -ml-px pl-[15px]"
                      : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{job.log_command_name}</span>
                    <JobHealthBadge status={job.status} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {job.description}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 space-y-0.5">
                    <div>
                      <Clock className="h-2.5 w-2.5 inline mr-0.5" />
                      Last: {formatDate(job.last_run_at)}
                      {job.last_duration_seconds != null
                        ? ` · ${job.last_duration_seconds.toFixed(1)}s`
                        : ""}
                    </div>
                    {job.next_expected_at && (
                      <div>Next: {formatDate(job.next_expected_at)}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Execute + Result */}
        <div className="lg:col-span-2 space-y-4">
          {selectedJob ? (
            <div className="border border-border">
              <div className="border-b border-border px-4 py-3 bg-muted/30 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold tracking-tight">
                    {selectedJob.log_command_name}
                  </span>
                  {selectedJob.triggerable && <CronPostBadge />}
                  <JobHealthBadge status={selectedJob.status} />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {selectedJob.description}
                </p>
                <div className="text-[10px] text-muted-foreground space-y-0.5">
                  <div>Last run: {formatDate(selectedJob.last_run_at)}</div>
                  <div>Next expected: {formatDate(selectedJob.next_expected_at)}</div>
                  {selectedJob.last_log_id != null && (
                    <div>Last log: #{selectedJob.last_log_id}</div>
                  )}
                </div>
              </div>
              <div className="p-4 space-y-4">
                <div className="text-xs text-muted-foreground">
                  Tenant schema (X-Tenant):{" "}
                  <span className="text-foreground">{schema ? String(schema) : "—"}</span>
                  <span className="ml-2 text-[10px]">
                    (from schema cookie — set automatically)
                  </span>
                </div>

                <div className="border-t border-border pt-3 flex items-center gap-3">
                  <button
                    onClick={runCron}
                    disabled={loading || !token || !selectedJob.triggerable}
                    title={
                      !selectedJob.triggerable
                        ? "Scheduled only — not manually triggerable"
                        : undefined
                    }
                    className="flex items-center gap-2 px-4 py-2 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? (
                      <Spinner className="h-4 w-4 " />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    <span>RUN NOW</span>
                  </button>
                  {!selectedJob.triggerable && (
                    <span className="text-xs text-muted-foreground">
                      Scheduled only — not manually triggerable
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-border p-4 text-xs text-muted-foreground">
              Select a job from the list.
            </div>
          )}

          {/* Result */}
          {response && (
            <div className="border border-border">
              <div
                className={`border-b border-border px-4 py-2 ${
                  isConflict
                    ? "bg-amber-500/10"
                    : response.isError
                      ? "bg-destructive/20"
                      : "bg-green-500/10"
                }`}
              >
                <span className="text-muted-foreground">
                  RESULT ·{" "}
                  {isConflict ? "ALREADY RUNNING" : response.isError ? "ERROR" : "SUCCESS"}
                </span>
              </div>

              <div className="p-4 space-y-3">
                {isConflict && response.details && (
                  <div className="bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                    {response.details}
                  </div>
                )}

                {!isConflict && response.isError && response.details && (
                  <div className="text-xs text-destructive">{response.details}</div>
                )}

                {log && (
                  <>
                    <div className="flex items-center gap-3 flex-wrap">
                      <TriggerLogStatusBadge status={log.status} />
                      <span className="text-[10px] text-muted-foreground">
                        #{log.id} · Duration: {getDuration(log.created_at, log.completed_at)}
                      </span>
                    </div>

                    <div className="text-[10px] text-muted-foreground">
                      Started: {formatDate(log.created_at)} · Completed:{" "}
                      {formatDate(log.completed_at)}
                    </div>

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

                    {log.error_message && (
                      <div>
                        <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">
                          error
                        </div>
                        <CollapsiblePre
                          content={log.error_message}
                          className="bg-destructive/10 border border-destructive/30 text-destructive"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
