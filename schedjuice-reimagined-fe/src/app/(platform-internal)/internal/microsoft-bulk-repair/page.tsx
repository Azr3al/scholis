"use client";

import { Spinner } from "@/components/primitives/spinner";
import { PageContainer } from "@/components/layout/page-container";
import {
  getMicrosoftRepairJob,
  microsoftRepairDryRun,
  MicrosoftCandidate,
  MicrosoftCandidateSummary,
  MicrosoftRepairJob,
  MicrosoftRepairTargetType,
  startMicrosoftRepairJob,
} from "@/app/client-api/microsoft";
import { RequireInternalTenant } from "@/components/internal/require-internal-tenant";
import { MicrosoftStatusChip } from "@/components/microsoft/microsoft-status-chip";
import { Button } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { useInternalTenant } from "@/hooks/useInternalTenant";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Wrench } from "iconoir-react";
import { parseAsInteger, useQueryState } from "nuqs";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type DryRunResult = {
  target_type: MicrosoftRepairTargetType;
  summary: MicrosoftCandidateSummary;
  candidates: MicrosoftCandidate[];
};

const JOB_DONE = new Set(["succeeded", "partial", "failed"]);

export default function MicrosoftBulkRepairPage() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const { organizationId } = useInternalTenant();

  const [target, setTarget] = useState<MicrosoftRepairTargetType>(
    (searchParams.get("target") as MicrosoftRepairTargetType) || "users",
  );
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [jobId, setJobId] = useQueryState("job", parseAsInteger);
  const prevOrganizationIdRef = useRef<number | null | undefined>(undefined);

  const dryRunMutation = useMutation({
    mutationFn: () => microsoftRepairDryRun(target, organizationId!),
    onSuccess: (res) => setDryRun(res.data.data as DryRunResult),
    onError: (err) =>
      toast.add({
        title: "Dry-run failed",
        description: parseSchedjuiceApiError(err),
      }),
  });

  const startMutation = useMutation({
    mutationFn: () => startMicrosoftRepairJob(target, organizationId!, []),
    onSuccess: (res) => {
      const job = res.data.data as MicrosoftRepairJob;
      void setJobId(job.id);
      toast.add({ title: `Repair job #${job.id} started` });
    },
    onError: (err) =>
      toast.add({
        title: "Could not start repair",
        description: parseSchedjuiceApiError(err),
      }),
  });

  const { data: jobData } = useQuery({
    queryKey: ["microsoft-repair-job", jobId, organizationId],
    queryFn: () => getMicrosoftRepairJob(jobId!, organizationId!),
    enabled: jobId != null && organizationId != null,
    refetchInterval: (data) => {
      const job = (data as any)?.data?.data as MicrosoftRepairJob | undefined;
      if (job && JOB_DONE.has(job.status)) return false;
      return 2000;
    },
  });
  const job = jobData?.data?.data as MicrosoftRepairJob | undefined;

  useEffect(() => {
    // Reset dry-run output when switching target or tenant.
    setDryRun(null);
    if (
      prevOrganizationIdRef.current !== undefined &&
      prevOrganizationIdRef.current !== organizationId
    ) {
      void setJobId(null);
    }
    prevOrganizationIdRef.current = organizationId;
  }, [target, organizationId, setJobId]);

  return (
    <PageContainer width="wide" className="font-mono text-sm min-h-[70vh] max-w-3xl">
      <div className="border-b border-border pb-4 mb-6">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Wrench className="h-4 w-4" />
          <span>SUPERADMIN TOOLS</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Microsoft bulk repair</h1>
        <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
          Dry-run first to see repairable vs blocked records, then start an asynchronous
          repair. Repairs run in the background; this page polls for progress.
        </p>
      </div>

      <RequireInternalTenant>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex border border-border">
            {(
              [
                "users",
                "courses",
                "unlicensed_users",
                "scope_team_owners",
              ] as MicrosoftRepairTargetType[]
            ).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTarget(t)}
                className={`px-3 py-1.5 text-xs capitalize ${
                  target === t ? "bg-foreground text-background" : "hover:bg-muted/40"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => dryRunMutation.mutate()}
            isLoading={dryRunMutation.isLoading}
            disabled={organizationId == null}
          >
            Run dry-run
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => startMutation.mutate()}
            isLoading={startMutation.isLoading}
            disabled={
              organizationId == null || !dryRun || dryRun.summary.repairable === 0
            }
          >
            Start repair{dryRun ? ` (${dryRun.summary.repairable})` : ""}
          </Button>
        </div>

        {dryRun ? (
          <div className="border border-border p-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="font-medium">Dry-run result</span>
              <span className="text-xs text-muted-foreground">
                {dryRun.summary.total} total · {dryRun.summary.repairable} repairable
              </span>
            </div>
            <div className="mt-3 max-h-80 overflow-auto divide-y divide-border/60">
              {dryRun.candidates.map((c) => (
                <div
                  key={c.candidate_key ?? String(c.id)}
                  className="flex items-center justify-between gap-2 py-1.5"
                >
                  <span className="text-xs truncate">
                    {c.course_title ? `${c.course_title} · ` : ""}
                    {c.name ?? c.email ?? c.title ?? `#${c.id}`}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <MicrosoftStatusChip status={c.status} />
                  </span>
                </div>
              ))}
              {dryRun.candidates.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  Nothing to repair.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {job ? (
          <div className="border border-border p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">Repair job #{job.id}</span>
              <span className="flex items-center gap-2">
                <MicrosoftStatusChip status={job.status} />
                {!JOB_DONE.has(job.status) ? (
                  <Spinner className="h-4 w-4 text-muted-foreground" />
                ) : null}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {job.succeeded} succeeded · {job.failed} failed · {job.skipped} skipped ·{" "}
              {job.total} processed
            </p>
            {job.error_message ? (
              <p className="text-xs text-destructive mt-2">{job.error_message}</p>
            ) : null}
            {job.results && job.results.length > 0 ? (
              <div className="mt-3 max-h-80 overflow-auto divide-y divide-border/60">
                {job.results.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-2 py-1.5"
                  >
                    <span className="text-xs truncate">
                      #{r.id} {r.detail}
                    </span>
                    <MicrosoftStatusChip status={r.status} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </RequireInternalTenant>
    </PageContainer>
  );
}
