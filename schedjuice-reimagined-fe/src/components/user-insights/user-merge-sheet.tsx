"use client";
import { Spinner } from "@/components/primitives/spinner";
import { Button, Dialog, Select, Sheet, buttonVariants, useToast } from "@/components/primitives";

import { makePostRequest } from "@/app/client-api/utils";
import {
  formatMsLastSignIn,
  recommendSurvivor,
} from "@/helpers/user-insights";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import type {
  DuplicateCluster,
  MergeApplyResponse,
  MergePreviewResponse,
  MsSignInEntry,
} from "@/types/user-insights";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

type UserMergeSheetProps = {
  cluster: DuplicateCluster | null;
  signInByUserId: Record<string, MsSignInEntry>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged: () => void;
};

export function UserMergeSheet({
  cluster,
  signInByUserId,
  open,
  onOpenChange,
  onMerged,
}: UserMergeSheetProps) {
  const toast = useToast();
  const [survivorUserId, setSurvivorUserId] = useState<number | null>(null);
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [microsoftId, setMicrosoftId] = useState<string | null>(null);
  const [preview, setPreview] = useState<MergePreviewResponse["data"] | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const emailOptions = useMemo(() => {
    if (!cluster) return [];
    const emails = new Set<string>();
    for (const user of cluster.users) {
      if (user.email) emails.add(user.email);
      if (user.communication_email) emails.add(user.communication_email);
    }
    return Array.from(emails);
  }, [cluster]);

  const msOptions = useMemo(() => {
    if (!cluster) return [];
    return cluster.users.filter((u) => u.microsoft_id);
  }, [cluster]);

  useEffect(() => {
    if (!cluster || !open) return;
    const rec = recommendSurvivor(cluster.users, signInByUserId);
    setSurvivorUserId(rec.survivorUserId);
    setPrimaryEmail(rec.primaryEmail);
    setMicrosoftId(rec.microsoftId);
    setPreview(null);
  }, [cluster, open, signInByUserId]);

  const mergeBody = useMemo(() => {
    if (!cluster || survivorUserId == null) return null;
    return {
      cluster_id: cluster.cluster_id,
      survivor_user_id: survivorUserId,
      primary_email: primaryEmail,
      microsoft_id: microsoftId,
      absorbed_user_ids: cluster.users
        .filter((u) => u.id !== survivorUserId)
        .map((u) => u.id),
    };
  }, [cluster, survivorUserId, primaryEmail, microsoftId]);

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!mergeBody) throw new Error("Missing merge body");
      const res = await makePostRequest(
        "users/insights/merge/preview",
        mergeBody,
      );
      return res.data as MergePreviewResponse;
    },
    onSuccess: (data) => setPreview(data.data),
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Preview failed",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!mergeBody) throw new Error("Missing merge body");
      const res = await makePostRequest("users/insights/merge/apply", mergeBody);
      return res.data as MergeApplyResponse;
    },
    onSuccess: () => {
      toast.add({ title: "Accounts merged" });
      setConfirmOpen(false);
      onOpenChange(false);
      onMerged();
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Merge failed",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  if (!cluster) return null;

  return (
    <>
      <Sheet.Root open={open} onOpenChange={onOpenChange}>
        <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup className="overflow-y-auto sm:max-w-lg">
          <div>
            <Sheet.Title>Review merge</Sheet.Title>
            <Sheet.Description>
              Choose which account to keep. All enrollments and records from
              other accounts will move to the survivor.
            </Sheet.Description>
          </div>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label>Survivor account</label>
              <Select
                value={survivorUserId != null ? String(survivorUserId) : ""}
                onValueChange={(v) => setSurvivorUserId(Number(v))}
                placeholder="Select survivor"
                items={cluster.users.map((user) => ({
                  value: String(user.id),
                  label: `${user.name} (${user.email})`,
                }))}
              />
            </div>

            <div className="space-y-2">
              <label>Primary email</label>
              <Select
                value={primaryEmail}
                onValueChange={setPrimaryEmail}
                placeholder="Select email"
                items={emailOptions.map((email) => ({
                  value: email,
                  label: email,
                }))}
              />
            </div>

            {msOptions.length > 0 ? (
              <div className="space-y-2">
                <label>Microsoft account</label>
                <Select
                  value={microsoftId ?? "__none__"}
                  onValueChange={(v) =>
                    setMicrosoftId(v === "__none__" ? null : String(v ?? ""))
                  }
                  placeholder="Select Microsoft account"
                  items={[
                    { value: "__none__", label: "None" },
                    ...msOptions.map((user) => ({
                      value: user.microsoft_id!,
                      label: `${user.name} — ${formatMsLastSignIn(signInByUserId[String(user.id)])}`,
                    })),
                  ]}
                />
              </div>
            ) : null}

            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-2">Student</th>
                    <th className="p-2">MS last sign-in</th>
                  </tr>
                </thead>
                <tbody>
                  {cluster.users.map((user) => (
                    <tr key={user.id} className="border-b last:border-0">
                      <td className="p-2">{user.name}</td>
                      <td className="p-2">
                        {formatMsLastSignIn(signInByUserId[String(user.id)])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview ? (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium">Preview</p>
                <ul className="list-inside list-disc text-muted-foreground">
                  <li>
                    {preview.reassignments.user_courses ?? 0} enrollments to
                    reassign
                  </li>
                  <li>
                    {preview.reassignments.user_events ?? 0} attendance rows to
                    reassign
                  </li>
                  <li>
                    {preview.reassignments.user_payments ?? 0} payments to
                    reassign
                  </li>
                </ul>
                {preview.warnings.map((w) => (
                  <p key={w} className="text-amber-700 dark:text-amber-300">
                    {w}
                  </p>
                ))}
              </div>
            ) : null}
          </div>

          <div className="gap-2 sm:flex-col sm:space-x-0">
            <Button
              type="button"
              variant="secondary" disabled={previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              {previewMutation.isPending ? (
                <Spinner className="mr-2 h-4 w-4 " />
              ) : null}
              Preview merge
            </Button>
            <Button
              type="button"
              disabled={!preview || applyMutation.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              Confirm merge
            </Button>
          </div>
        </Sheet.Popup>
      </Sheet.Portal>
      </Sheet.Root>

      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <div>
            <Dialog.Title>Merge student accounts?</Dialog.Title>
            <Dialog.Description>
              This cannot be undone. Absorbed accounts will be deleted after
              their data is moved to the survivor.
            </Dialog.Description>
          </div>
          <div>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger" disabled={applyMutation.isPending}
              onClick={() => applyMutation.mutate()}
            >
              {applyMutation.isPending ? (
                <Spinner className="mr-2 h-4 w-4 " />
              ) : null}
              Merge accounts
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
