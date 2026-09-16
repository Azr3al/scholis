"use client";

import {
  cancelMicrosoftPasswordResetJob,
  getMicrosoftPasswordResetJob,
  microsoftPasswordResetPreview,
  MicrosoftPasswordResetCommitRow,
  MicrosoftPasswordResetPreviewRow,
  MicrosoftPasswordResetPreviewSummary,
  startMicrosoftPasswordResetJob,
} from "@/app/client-api/microsoft";
import { PageContainer } from "@/components/layout/page-container";
import { RequireInternalTenant } from "@/components/internal/require-internal-tenant";
import {
  AlertDialog,
  Button,
  Input,
  Textarea,
  useToast,
} from "@/components/primitives";
import { exportReportToCSV } from "@/helpers/file";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { useInternalTenant } from "@/hooks/useInternalTenant";
import { parseStudentEmailPaste } from "@/lib/course/parse-student-email-paste";
import { chunkEmails, runBatchesSequentially } from "@/lib/microsoft/password-reset-bulk";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Key as KeyRound } from "iconoir-react";
import { parseAsInteger, useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";

type Row = MicrosoftPasswordResetPreviewRow | MicrosoftPasswordResetCommitRow;

type Phase =
  | "idle"
  | "previewing"
  | "preview-failed"
  | "preview-ready"
  | "committing"
  | "commit-failed"
  | "done";

type PreviewSummary = Omit<MicrosoftPasswordResetPreviewSummary, "total">;

const JOB_DONE = new Set(["succeeded", "partial", "failed"]);

function emptyPreviewSummary(): PreviewSummary {
  return { eligible: 0, not_found: 0, no_microsoft_account: 0 };
}

function mergePreviewSummary(
  current: PreviewSummary,
  batch: MicrosoftPasswordResetPreviewSummary,
): PreviewSummary {
  return {
    eligible: current.eligible + batch.eligible,
    not_found: current.not_found + batch.not_found,
    no_microsoft_account:
      current.no_microsoft_account + batch.no_microsoft_account,
  };
}

function statusLabel(status: string): string {
  switch (status) {
    case "eligible":
      return "Eligible";
    case "not_found":
      return "Not found";
    case "no_microsoft_account":
      return "No MS account";
    case "succeeded":
      return "Succeeded";
    case "skipped":
      return "Skipped";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function downloadPasswordResetResults(rows: MicrosoftPasswordResetCommitRow[]) {
  const csvRows: string[][] = [["email", "status", "reason"]];
  for (const row of rows) {
    csvRows.push([row.email, row.status, row.reason ?? ""]);
  }
  exportReportToCSV(csvRows, "microsoft-password-reset-results.csv");
}

export default function MicrosoftPasswordResetPage() {
  const toast = useToast();
  const { organizationId } = useInternalTenant();
  const [pasteText, setPasteText] = useState("");
  const [previewRows, setPreviewRows] = useState<Row[]>([]);
  const [previewSummary, setPreviewSummary] = useState<PreviewSummary | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState("Password123$");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{
    batchIndex: number;
    batchCount: number;
  } | null>(null);
  const [resumeFrom, setResumeFrom] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [jobId, setJobId] = useQueryState("job", parseAsInteger);
  const prevOrganizationIdRef = useRef<number | null | undefined>(undefined);

  const parsedEmails = useMemo(
    () => parseStudentEmailPaste(pasteText),
    [pasteText],
  );
  const eligible = previewSummary?.eligible ?? 0;
  const passwordValid = password.trim().length >= 8;

  const resetWorkflow = () => {
    setPhase("idle");
    setPreviewRows([]);
    setPreviewSummary(null);
    setProgress(null);
    setResumeFrom(null);
    setLastError(null);
    void setJobId(null);
  };

  const previewMutation = useMutation({
    mutationFn: async (startIndex: number) => {
      const emails = parseStudentEmailPaste(pasteText);
      const chunks = chunkEmails(emails);
      setProgress({ batchIndex: startIndex, batchCount: chunks.length });
      setLastError(null);

      let aggregatedSummary =
        startIndex === 0 ? emptyPreviewSummary() : { ...(previewSummary ?? emptyPreviewSummary()) };
      let aggregatedRows: MicrosoftPasswordResetPreviewRow[] =
        startIndex === 0 ? [] : [...(previewRows as MicrosoftPasswordResetPreviewRow[])];

      if (startIndex === 0) {
        setPreviewRows([]);
        setPreviewSummary(null);
      }

      const outcome = await runBatchesSequentially(
        chunks,
        startIndex,
        async (batch) => {
          const res = await microsoftPasswordResetPreview(batch, organizationId!);
          return res.data.data;
        },
        (data, batchIndex) => {
          aggregatedSummary = mergePreviewSummary(aggregatedSummary, data.summary);
          aggregatedRows = [...aggregatedRows, ...data.results];
          setPreviewSummary({ ...aggregatedSummary });
          setPreviewRows([...aggregatedRows]);
          setProgress({ batchIndex: batchIndex + 1, batchCount: chunks.length });
        },
      );

      return { outcome, chunks, summary: aggregatedSummary };
    },
    onSuccess: ({ outcome, chunks }) => {
      if (outcome.error != null) {
        const nextResume = outcome.completedThrough + 1;
        setResumeFrom(nextResume);
        setPhase("preview-failed");
        setLastError(parseSchedjuiceApiError(outcome.error));
        return;
      }

      setResumeFrom(null);
      setProgress({ batchIndex: chunks.length, batchCount: chunks.length });
      setPhase("preview-ready");
    },
    onError: (err) => {
      setPhase("preview-failed");
      setLastError(parseSchedjuiceApiError(err));
      toast.add({
        title: "Preview failed",
        description: parseSchedjuiceApiError(err),
      });
    },
  });

  const startJobMutation = useMutation({
    mutationFn: async () => {
      const emails = parseStudentEmailPaste(pasteText);
      const res = await startMicrosoftPasswordResetJob(
        emails,
        organizationId!,
        password || undefined,
      );
      return res.data.data;
    },
    onSuccess: (job) => {
      setLastError(null);
      void setJobId(job.id);
      setPhase("committing");
      toast.add({ title: `Password reset job #${job.id} started` });
    },
    onError: (err) => {
      setPhase("commit-failed");
      setLastError(parseSchedjuiceApiError(err));
      toast.add({
        title: "Could not start password reset",
        description: parseSchedjuiceApiError(err),
      });
    },
  });

  const { data: jobData } = useQuery({
    queryKey: ["microsoft-password-reset-job", jobId, organizationId],
    queryFn: () => getMicrosoftPasswordResetJob(jobId!, organizationId!),
    enabled: jobId != null && organizationId != null,
    refetchInterval: (data) => {
      const current = (data as unknown as {
        data?: { data?: { status?: string } };
      })?.data?.data;
      if (current?.status && JOB_DONE.has(current.status)) return false;
      return 2000;
    },
  });
  const job = jobData?.data?.data;

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await cancelMicrosoftPasswordResetJob(
        jobId!,
        organizationId!,
      );
      return res.data.data;
    },
    onSuccess: () => {
      toast.add({ title: "Password reset job cancelled" });
    },
    onError: (err) => {
      toast.add({
        title: "Could not cancel job",
        description: parseSchedjuiceApiError(err),
      });
    },
  });

  const jobTerminal = job != null && JOB_DONE.has(job.status);
  const jobProcessed =
    job != null ? job.succeeded + job.failed + job.skipped : 0;

  useEffect(() => {
    if (jobTerminal && jobId != null && (phase === "committing" || phase === "idle")) {
      const wasRunning = phase === "committing";
      const wasCancelled = job?.error_message === "Cancelled by operator";
      setPhase("done");
      setConfirmOpen(false);
      if (wasRunning && !wasCancelled) {
        toast.add({
          title: "Password reset complete",
          description: `${job!.succeeded} succeeded · ${job!.skipped} skipped · ${job!.failed} failed`,
        });
      }
    }
  }, [jobTerminal, jobId, phase, job, toast]);

  useEffect(() => {
    if (
      prevOrganizationIdRef.current !== undefined &&
      prevOrganizationIdRef.current !== organizationId
    ) {
      resetWorkflow();
    }
    prevOrganizationIdRef.current = organizationId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const isPreviewRunning = previewMutation.isPending;
  const isCommitStarting = startJobMutation.isPending;
  const isJobRunning = jobId != null && !jobTerminal;
  const isRunning = isPreviewRunning || isCommitStarting || isJobRunning;
  const plannedBatchCount = chunkEmails(parsedEmails).length;

  const commitRows: MicrosoftPasswordResetCommitRow[] = useMemo(() => {
    if (job?.results == null) return [];
    return job.results.map((row) => ({
      email: row.email,
      status: row.status as MicrosoftPasswordResetCommitRow["status"],
      reason: row.reason,
    }));
  }, [job]);

  const displayRows: Row[] =
    commitRows.length > 0 ? commitRows : previewRows;

  const startPreview = (startIndex: number) => {
    setPhase("previewing");
    previewMutation.mutate(startIndex);
  };

  return (
    <PageContainer width="wide" className="font-mono text-sm min-h-[70vh] max-w-3xl">
      <div className="border-b border-border pb-4 mb-6">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <KeyRound className="h-4 w-4" />
          <span>SUPERADMIN TOOLS</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Microsoft password reset</h1>
        <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
          Paste emails to reset their Entra passwords to the password below
          (defaults to the onboarding password). Does not change local
          Schedjuice passwords. Resets run as a background job — the page
          keeps polling progress even for large lists.
        </p>
      </div>

      <RequireInternalTenant>
        <Textarea
          value={pasteText}
          onChange={(e) => {
            setPasteText(e.target.value);
            resetWorkflow();
          }}
          placeholder="One email per line (tabs from Excel also work)"
          rows={8}
          className="font-mono text-xs"
          disabled={isRunning}
        />

        {parsedEmails.length > 0 ? (
          <p className="text-xs text-muted-foreground mt-2">
            {parsedEmails.length} email{parsedEmails.length === 1 ? "" : "s"}
            {plannedBatchCount > 1
              ? ` · preview runs in ${plannedBatchCount} batches of up to 50`
              : null}
          </p>
        ) : null}

        <div className="mt-4">
          <label
            htmlFor="ms-reset-password"
            className="text-xs font-medium text-foreground"
          >
            New Entra password
          </label>
          <Input
            id="ms-reset-password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password to set on the Microsoft accounts"
            className="font-mono text-xs mt-1"
            disabled={isRunning}
            aria-invalid={!passwordValid}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {passwordValid
              ? "Applied to every eligible account. Avoid common/banned passwords (e.g. Password123) — Microsoft silently rejects them."
              : "Password must be at least 8 characters."}
          </p>
        </div>

        {progress && isPreviewRunning ? (
          <p className="text-xs text-muted-foreground mt-2" aria-live="polite">
            Preview batch {Math.min(progress.batchIndex + 1, progress.batchCount)} / {progress.batchCount}
          </p>
        ) : null}

        {job != null ? (
          <p className="text-xs text-muted-foreground mt-2" aria-live="polite">
            Job #{job.id} · {job.status}
            {jobTerminal ? "" : ` · ${jobProcessed} processed`} ·{" "}
            {job.succeeded} succeeded · {job.skipped} skipped · {job.failed} failed
            {job.error_message ? ` · ${job.error_message}` : ""}
          </p>
        ) : null}

        {lastError && (phase === "preview-failed" || phase === "commit-failed") ? (
          <p className="text-xs text-destructive mt-2">{lastError}</p>
        ) : null}

        <div className="flex flex-wrap gap-2 mt-4">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => startPreview(0)}
            isLoading={isPreviewRunning}
            disabled={organizationId == null || parsedEmails.length === 0 || isRunning}
          >
            Preview
          </Button>

          {phase === "preview-failed" && resumeFrom != null ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => startPreview(resumeFrom)}
              isLoading={isPreviewRunning}
              disabled={organizationId == null || isRunning}
            >
              Retry preview from batch {resumeFrom + 1}
            </Button>
          ) : null}

          <Button
            type="button"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={
              organizationId == null ||
              phase !== "preview-ready" ||
              eligible === 0 ||
              !passwordValid ||
              isRunning
            }
          >
            Reset passwords{eligible > 0 ? ` (${eligible})` : ""}
          </Button>

          {phase === "commit-failed" ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setPhase("previewing");
                startJobMutation.mutate();
              }}
              isLoading={isCommitStarting}
              disabled={organizationId == null || isRunning}
            >
              Retry starting reset job
            </Button>
          ) : null}

          {isJobRunning ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => cancelMutation.mutate()}
              isLoading={cancelMutation.isPending}
              disabled={organizationId == null}
            >
              Cancel job
            </Button>
          ) : null}

          {phase === "done" && commitRows.length > 0 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => downloadPasswordResetResults(commitRows)}
            >
              Download results (CSV)
            </Button>
          ) : null}
        </div>

        {previewSummary ? (
          <p className="text-xs text-muted-foreground mt-4">
            {previewSummary.eligible} eligible · {previewSummary.not_found} not found ·{" "}
            {previewSummary.no_microsoft_account} no MS account
          </p>
        ) : null}

        {displayRows.length > 0 ? (
          <div className="border border-border mt-4 max-h-96 overflow-auto divide-y divide-border/60">
            {displayRows.map((row) => (
              <div
                key={row.email}
                className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
              >
                <span className="truncate">{row.email}</span>
                <span className="shrink-0 text-muted-foreground">
                  {statusLabel(row.status)}
                  {"reason" in row && row.reason ? ` · ${row.reason}` : ""}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialog.Portal>
            <AlertDialog.Backdrop />
            <AlertDialog.Popup>
              <AlertDialog.Title>Reset Entra passwords?</AlertDialog.Title>
              <AlertDialog.Description>
                Start a background job resetting Entra passwords to{" "}
                <span className="font-mono">{password.trim()}</span> for {eligible}{" "}
                user{eligible === 1 ? "" : "s"}? Skipped emails will not be changed.
                You can leave this page; the job keeps running.
              </AlertDialog.Description>
              <div className="mt-4 flex justify-end gap-2">
                <AlertDialog.Close render={<Button variant="ghost">Cancel</Button>} />
                <Button
                  variant="danger"
                  isLoading={isCommitStarting}
                  onClick={() => {
                    setConfirmOpen(false);
                    startJobMutation.mutate();
                  }}
                >
                  Confirm reset
                </Button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </RequireInternalTenant>
    </PageContainer>
  );
}
