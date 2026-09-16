"use client";

import { Spinner } from "@/components/primitives/spinner";
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AlertDialog } from "@/components/primitives/alert-dialog";
import { Button } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import { canAccessDemoProvision } from "@/helpers/authorization";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import {
  fetchDemoProvisionJob,
  fetchDemoProvisionStatus,
  startDemoProvision,
} from "@/lib/demo-artifacts-api";
import type { DemoProvisionJob, DemoProvisionStatus } from "@/types/demo-artifacts";

import { DemoCredentialsBlock } from "./demo-credentials-block";

const JOB_DONE = new Set(["succeeded", "failed"]);

function provisionCommand(blueprintId: string, relativePath: string) {
  return `python manage.py provision-demo \\
  --blueprint ${blueprintId} \\
  --brief demo-artifacts/${relativePath}`;
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === "succeeded"
      ? "text-emerald-700 bg-emerald-50"
      : status === "failed"
        ? "text-destructive bg-destructive/10"
        : "text-amber-700 bg-amber-50";
  return (
    <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 ${tone}`}>
      {status}
    </span>
  );
}

export function DemoProvisionPanel({
  slug,
  blueprintId,
  briefRelativePath,
  onProvisionComplete,
}: {
  slug: string;
  blueprintId: string;
  briefRelativePath: string;
  onProvisionComplete?: () => void;
}) {
  const { user, isLoading: userLoading } = useUser();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [jobId, setJobId] = useState<number | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const canProvision = canAccessDemoProvision(user, tenant);

  const statusQuery = useQuery({
    queryKey: ["demo-provision-status", slug],
    queryFn: () => fetchDemoProvisionStatus(slug),
    enabled: canProvision,
  });

  useEffect(() => {
    const activeId = statusQuery.data?.active_job?.id;
    if (activeId != null) {
      setJobId(activeId);
    }
  }, [statusQuery.data?.active_job?.id]);

  const jobQuery = useQuery({
    queryKey: ["demo-provision-job", jobId],
    queryFn: () => fetchDemoProvisionJob(jobId!),
    enabled: jobId != null,
    refetchInterval: (data) => {
      const current = data as DemoProvisionJob | undefined;
      if (current && JOB_DONE.has(current.status)) return false;
      return 2000;
    },
  });

  const job = jobQuery.data;
  const status: DemoProvisionStatus | undefined = statusQuery.data;
  const jobRunning = Boolean(
    (job != null && !JOB_DONE.has(job.status)) ||
      (status?.active_job != null &&
        !JOB_DONE.has(status.active_job.status)),
  );

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["demo-provision-status", slug] });
  }, [queryClient, slug]);

  const startMutation = useMutation({
    mutationFn: (reset: boolean) => startDemoProvision(slug, reset),
    onSuccess: (started) => {
      setJobId(started.id);
      toast.add({ title: `Provision job #${started.id} started` });
      invalidate();
    },
    onError: (err) =>
      toast.add({
        title: "Could not start provision",
        description: parseSchedjuiceApiError(err),
      }),
  });

  useEffect(() => {
    if (job?.status === "succeeded") {
      invalidate();
      onProvisionComplete?.();
    }
  }, [job?.status, invalidate, onProvisionComplete]);

  if (userLoading || tenantLoading) {
    return null;
  }

  if (!canProvision) {
    return null;
  }

  const cliCommand = provisionCommand(blueprintId, briefRelativePath);

  if (statusQuery.isError) {
    return (
      <section className="mb-6 border border-border p-4">
        <p className="text-destructive text-xs">
          Could not load provision status:{" "}
          {statusQuery.error instanceof Error
            ? statusQuery.error.message
            : "Unknown error"}
        </p>
      </section>
    );
  }

  if (!status) {
    return (
      <section className="mb-6 border border-border p-4">
        <Spinner className="h-4 w-4 text-muted-foreground" />
      </section>
    );
  }

  const showJobCredentials = job?.status === "succeeded" && job.result != null;
  const persistedCredentials =
    !showJobCredentials && status.tenant_exists && status.credentials
      ? status.credentials
      : null;

  return (
    <section className="mb-6 border border-border p-4">
      <h3 className="text-xs font-semibold mb-3 uppercase tracking-wide text-muted-foreground">
        Demo provisioning
      </h3>

      {!status.provision_ui_enabled ? (
        <>
          <p className="text-muted-foreground text-xs mb-3">
            Demo provisioning is only available in dev/staging. Use the CLI on
            production:
          </p>
          <pre className="border border-border p-3 text-[11px] overflow-x-auto">
            {cliCommand}
          </pre>
        </>
      ) : (
        <>
          <KeyValueRow label="Domain" value={status.domain_url} />
          <KeyValueRow label="Schema" value={status.schema_name} />

          {status.tenant_exists ? (
            <p className="text-xs mt-3 mb-3">
              <span className="inline-block px-2 py-0.5 bg-muted text-muted-foreground mr-2">
                Demo tenant exists
              </span>
              <a
                href={`https://${status.domain_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {status.domain_url}
              </a>
            </p>
          ) : null}

          {persistedCredentials ? (
            <DemoCredentialsBlock
              credentials={persistedCredentials}
              domainUrl={status.domain_url}
              description="Standard demo logins for this tenant. Set DEV_TENANT_DOMAIN locally, restart the backend, then sign in."
            />
          ) : null}

          <div className="flex flex-wrap gap-2 mt-4">
            {!status.tenant_exists ? (
              <Button
                type="button"
                size="sm"
                disabled={jobRunning || startMutation.isPending}
                isLoading={startMutation.isPending}
                onClick={() => startMutation.mutate(false)}
              >
                Provision demo
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={jobRunning || startMutation.isPending}
                onClick={() => setResetConfirmOpen(true)}
              >
                Reset & reprovision
              </Button>
            )}
          </div>

          {job ? (
            <div className="mt-4 border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">Job #{job.id}</span>
                <span className="flex items-center gap-2">
                  <StatusChip status={job.status} />
                  {!JOB_DONE.has(job.status) ? (
                    <Spinner className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : null}
                </span>
              </div>

              {job.error_message ? (
                <p className="text-xs text-destructive mt-2">{job.error_message}</p>
              ) : null}

              {showJobCredentials ? (
                <DemoCredentialsBlock
                  credentials={{
                    password: job.result!.password,
                    accounts: job.result!.accounts,
                    dev_tenant_domain_hint: job.result!.dev_tenant_domain_hint,
                  }}
                  domainUrl={job.result!.domain_url}
                  description={`${job.result!.school_name} is ready. Set DEV_TENANT_DOMAIN locally, restart the backend, then log into the demo tenant.`}
                />
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <AlertDialog.Root open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>Reset & reprovision?</AlertDialog.Title>
            <AlertDialog.Description>
              This deletes the existing demo tenant for{" "}
              <strong>{status.domain_url}</strong> and rebuilds it from the
              brief. All demo data and accounts will be replaced.
            </AlertDialog.Description>
            <div className="flex justify-end gap-2 mt-4">
              <AlertDialog.Close render={<Button variant="ghost">Cancel</Button>} />
              <Button
                variant="danger"
                isLoading={startMutation.isPending}
                onClick={() => {
                  setResetConfirmOpen(false);
                  startMutation.mutate(true);
                }}
              >
                Reset & reprovision
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-muted-foreground w-16 shrink-0">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
