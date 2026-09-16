"use client";
import { Button, Input, Skeleton, useToast } from "@/components/primitives";

import {
  createUserMicrosoftAccount,
  linkUserMicrosoftAccount,
} from "@/app/client-api/microsoft";
import { isMicrosoftLicenseBlocked } from "@/helpers/form";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { isAdmin, isSuperAdmin } from "@/helpers/authorization";
import { organizationType } from "@/types/organization";
import { accountType } from "@/types/user";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { MicrosoftStatusChip } from "@/components/microsoft/microsoft-status-chip";
import { MicrosoftIcon } from "./connector-icons";

/**
 * Microsoft connector row for the user edit Connectors section.
 * Admin-only; actions target the subject user.
 */
export function MicrosoftConnectorRow({
  user,
  viewerAccount,
  tenant,
  onUpdated,
}: {
  user: accountType;
  viewerAccount: accountType;
  tenant: organizationType | null;
  onUpdated?: () => void;
}) {
  const toast = useToast();
  const [showLink, setShowLink] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [licenseBlocked, setLicenseBlocked] = useState(false);

  const createMutation = useMutation({
    mutationFn: (opts?: { allowUnlicensed?: boolean }) =>
      createUserMicrosoftAccount(user.id, opts),
    onSuccess: () => {
      setLicenseBlocked(false);
      toast.add({ title: "Microsoft account created" });
      onUpdated?.();
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setShowLink(true);
        toast.add({
          type: "error",
          title: "Account may already exist",
          description:
            "A Microsoft account with this identity already exists. Link the existing account instead.",
        });
        return;
      }
      if (isMicrosoftLicenseBlocked(error)) {
        setLicenseBlocked(true);
      }
      toast.add({
        type: "error",
        title: "Could not create Microsoft account",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const assignLicenseMutation = useMutation({
    mutationFn: () => createUserMicrosoftAccount(user.id),
    onSuccess: () => {
      toast.add({ title: "Microsoft license assigned" });
      onUpdated?.();
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not assign Microsoft license",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const linkMutation = useMutation({
    mutationFn: () => linkUserMicrosoftAccount(user.id, identifier.trim()),
    onSuccess: () => {
      toast.add({ title: "Microsoft account linked" });
      setShowLink(false);
      setIdentifier("");
      onUpdated?.();
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not link Microsoft account",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const canManage = isSuperAdmin(viewerAccount) || isAdmin(viewerAccount);
  if (!tenant?.is_microsoft_on || !canManage) return null;

  const status =
    user.microsoft_status ?? (user.microsoft_id ? "linked" : "not_created");
  const isUnlicensed = status === "unlicensed";
  const isFullyLinked = Boolean(user.microsoft_id) && !isUnlicensed;
  const isDomainBlocked = status === "domain_blocked";
  const isBusy =
    createMutation.isLoading ||
    assignLicenseMutation.isLoading ||
    linkMutation.isLoading;

  const description = isUnlicensed
    ? "Microsoft account exists but no license is assigned."
    : isFullyLinked
      ? "Linked to a Microsoft account."
      : "No Microsoft account yet.";

  return (
    <div
      className="grid grid-cols-1 gap-4 py-6 first:pt-0 last:pb-0 md:grid-cols-[auto_1fr_auto] md:items-start md:gap-6"
      style={{ animationDelay: "0ms" }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
        <MicrosoftIcon className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium tracking-tight">Microsoft</span>
          <MicrosoftStatusChip status={status} />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>

        {(isFullyLinked || isUnlicensed) && user.microsoft_id ? (
          <p className="text-xs text-muted-foreground break-all">
            Object ID:{" "}
            <span className="font-mono text-foreground/80">{user.microsoft_id}</span>
          </p>
        ) : null}

        {!isFullyLinked && !isUnlicensed && isDomainBlocked ? (
          <p className="text-sm text-destructive">
            Email is not on an approved domain. Update the email first.
          </p>
        ) : null}

        {!isFullyLinked && !isUnlicensed && showLink ? (
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm text-muted-foreground">
              Enter the Microsoft object ID or user principal name (UPN/email).
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="object id or UPN"
                className="max-w-md"
              />
              <Button
                type="button"
                onClick={() => linkMutation.mutate()}
                isLoading={linkMutation.isLoading}
                disabled={!identifier.trim()}
                className="active:scale-[0.98] transition-transform"
              >
                Link
              </Button>
            </div>
          </div>
        ) : null}

        {isBusy ? (
          <div className="space-y-2 pt-1" aria-hidden>
            <Skeleton className="h-9 w-40" />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 md:justify-end md:pt-0.5">
        {isUnlicensed ? (
          <Button
            type="button"
            size="sm"
            onClick={() => assignLicenseMutation.mutate()}
            isLoading={assignLicenseMutation.isLoading}
            className="active:scale-[0.98] transition-transform"
          >
            Assign license
          </Button>
        ) : null}

        {!isFullyLinked && !isUnlicensed && !isDomainBlocked ? (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => createMutation.mutate(undefined)}
              isLoading={createMutation.isLoading}
              className="active:scale-[0.98] transition-transform"
            >
              Create account
            </Button>
            {licenseBlocked ? (
              <Button
                type="button"
                size="sm"
                variant="secondary" onClick={() => createMutation.mutate({ allowUnlicensed: true })}
                isLoading={createMutation.isLoading}
                className="active:scale-[0.98] transition-transform"
              >
                Create without license
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="secondary" onClick={() => setShowLink((v) => !v)}
              className="active:scale-[0.98] transition-transform"
            >
              Link existing
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
