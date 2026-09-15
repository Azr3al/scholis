"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, InfoCircle, Refresh, WarningTriangle } from "iconoir-react";

import { Button, Field, Input, Skeleton, useToast } from "@/components/primitives";
import { formatDate } from "@/helpers/date";
import {
  catchUpScholisEvents,
  connectScholis,
  getScholisConnection,
  scholisErrorMessage,
} from "@/lib/scholis-api";
import type { ScholisCatchUpResult } from "@/types/scholis";

export const SCHOLIS_CONNECTION_KEY = ["scholis", "connection"] as const;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border/40 py-2 last:border-b-0">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="font-mono text-sm text-text-primary">{children}</dd>
    </div>
  );
}

function Badge({ tone, children }: { tone: "ok" | "warn"; children: ReactNode }) {
  const icon = tone === "ok" ? Check : WarningTriangle;
  const Icon = icon;
  return (
    <span
      className={
        tone === "ok"
          ? "inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-600 dark:text-green-400"
          : "inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-2.5 py-0.5 text-xs font-medium text-danger"
      }
    >
      <Icon className="size-3.5" aria-hidden />
      {children}
    </span>
  );
}

/**
 * School-level connection to Scholis: status, connect, and catch-up.
 *
 * Connecting is idempotent, so the button stays available after a successful
 * connection. That is deliberate — a half-configured connection (a key but no
 * webhook, say, after an interrupted first attempt) is fixed by pressing the same
 * button rather than by finding a different one.
 */
export function ScholisConnectionPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [schoolName, setSchoolName] = useState("");
  const [catchUp, setCatchUp] = useState<ScholisCatchUpResult | null>(null);

  const status = useQuery({
    queryKey: SCHOLIS_CONNECTION_KEY,
    queryFn: getScholisConnection,
  });

  const connect = useMutation({
    mutationKey: ["scholis", "connect"],
    mutationFn: () =>
      connectScholis(schoolName.trim() ? { school_name: schoolName.trim() } : {}),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: SCHOLIS_CONNECTION_KEY });
      toast.add({
        title: data.connected ? "Connected to Scholis" : "Not connected",
        description: data.connected
          ? "Marks released at Scholis will now arrive here automatically."
          : undefined,
      });
      setSchoolName("");
    },
    onError: (error) => {
      toast.add({
        title: "Could not connect",
        description: scholisErrorMessage(error, "Scholis did not accept the request."),
      });
    },
  });

  const replay = useMutation({
    mutationKey: ["scholis", "catch-up"],
    mutationFn: catchUpScholisEvents,
    onSuccess: (result) => {
      setCatchUp(result);
      void queryClient.invalidateQueries({ queryKey: SCHOLIS_CONNECTION_KEY });
      // A catch-up that applies events can move marks, so anything showing marks
      // has to be re-read rather than trusted from cache.
      void queryClient.invalidateQueries({ queryKey: ["scholis"] });
      toast.add({
        title: result.skipped === "not_connected" ? "Nothing to catch up" : "Catch-up finished",
        description: result.skipped
          ? "This school is not connected yet."
          : `Saw ${result.seen} event${result.seen === 1 ? "" : "s"}, applied ${result.applied}.`,
      });
    },
    onError: (error) => {
      toast.add({
        title: "Catch-up failed",
        description: scholisErrorMessage(error, "Could not read Scholis's event log."),
      });
    },
  });

  const data = status.data;
  const connected = Boolean(data?.connected);

  return (
    <section aria-label="Scholis connection" className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-text-primary">Connection</h2>
            <p className="mt-0.5 text-sm text-text-muted">
              One school, one Scholis organisation.
            </p>
          </div>
          {status.isLoading ? (
            <Skeleton className="h-6 w-28 rounded-full" />
          ) : connected ? (
            <Badge tone="ok">Connected</Badge>
          ) : (
            <Badge tone="warn">Not connected</Badge>
          )}
        </div>

        {status.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : status.isError ? (
          <p className="text-sm text-danger">
            Could not read the connection status.{" "}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => void status.refetch()}
            >
              Try again
            </Button>
          </p>
        ) : connected && data ? (
          <dl className="mb-5">
            <Row label="School">{data.school_name || "—"}</Row>
            <Row label="Scholis organisation">{data.scholis_org_id || "—"}</Row>
            {/* The public half only. The secret half is encrypted server-side and
                is never sent to a browser, so there is nothing here to leak. */}
            <Row label="API key id">{data.api_key_id || "—"}</Row>
            <Row label="Webhook">
              {data.webhook_registered ? (
                <span className="inline-flex items-center gap-1.5 text-green-600 dark:text-green-400">
                  <Check className="size-3.5" aria-hidden />
                  registered
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-danger">
                  <WarningTriangle className="size-3.5" aria-hidden />
                  not registered
                </span>
              )}
            </Row>
            <Row label="Events processed up to">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5 text-text-muted" aria-hidden />
                {data.last_event_seq ?? "none yet"}
              </span>
            </Row>
            <Row label="Connected">
              {data.connected_at ? formatDate(data.connected_at) : "—"}
            </Row>
          </dl>
        ) : (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-border/50 bg-surface-hover/20 p-3">
            <InfoCircle className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
            <p className="text-sm leading-relaxed text-text-secondary">
              Connecting creates this school at Scholis, records an API key here,
              and registers the address Scholis delivers results to. It can be
              pressed again safely — nothing is duplicated.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <Field.Root className="min-w-56 flex-1">
            <Field.Label htmlFor="scholis-school-name">
              School name at Scholis
            </Field.Label>
            <Input
              id="scholis-school-name"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder={data?.school_name || "Leave blank to use this tenant's name"}
              autoComplete="organization"
            />
            <Field.Description>
              Optional. Only used the first time, when the organisation is created.
            </Field.Description>
          </Field.Root>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={connected ? "secondary" : "primary"}
              isLoading={connect.isLoading}
              onClick={() => connect.mutate()}
            >
              <Refresh className="size-4" aria-hidden />
              {connected ? "Re-check connection" : "Connect"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              isLoading={replay.isLoading}
              disabled={!connected}
              onClick={() => replay.mutate()}
              title={
                connected
                  ? "Replay events this school missed"
                  : "Connect first"
              }
            >
              Catch up
            </Button>
          </div>
        </div>

        {catchUp ? (
          <div className="mt-4 rounded-lg border border-border/50 bg-surface-hover/20 p-3 text-sm text-text-secondary">
            {catchUp.skipped ? (
              <p>Nothing to do: {catchUp.skipped.replace("_", " ")}.</p>
            ) : (
              <p>
                Saw <strong className="text-text-primary">{catchUp.seen}</strong>{" "}
                event{catchUp.seen === 1 ? "" : "s"}, applied{" "}
                <strong className="text-text-primary">{catchUp.applied}</strong>,
                already known{" "}
                <strong className="text-text-primary">{catchUp.duplicates ?? 0}</strong>.
                {typeof catchUp.cursor === "number"
                  ? ` Cursor now at ${catchUp.cursor}.`
                  : ""}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
