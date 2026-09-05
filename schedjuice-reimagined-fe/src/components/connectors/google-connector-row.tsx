"use client";

import {
  fetchGoogleLinkAuthorizeUrl,
  unlinkGoogleAccount,
  unlinkGoogleAccountForUser,
} from "@/app/client-api/google";
import ConfirmationDialog from "@/components/misc/confirmation-dialog";
import { Button, useToast } from "@/components/primitives";
import { isSuperAdmin } from "@/helpers/authorization";
import { parseGoogleOAuthReturn } from "@/helpers/login-composition";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { organizationType } from "@/types/organization";
import { accountType } from "@/types/user";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { GoogleIcon } from "./connector-icons";
import { GoogleStatusChip, resolveGoogleStatus } from "./google-status-chip";

/**
 * Google connector row for Google-enabled tenants.
 * Users connect/unlink on their own profile; superadmins can force-unlink others.
 */
export function GoogleConnectorRow({
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledReturnRef = useRef(false);
  const isSelf = viewerAccount.email === user.email;
  const canAdminUnlink = !isSelf && isSuperAdmin(viewerAccount);

  const linkMutation = useMutation({
    mutationFn: async () => {
      const authorizeUrl = await fetchGoogleLinkAuthorizeUrl(
        window.location.pathname,
      );
      window.location.assign(authorizeUrl);
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not connect Google",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: () => unlinkGoogleAccount(),
    onSuccess: () => {
      toast.add({ title: "Google account unlinked" });
      onUpdated?.();
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not unlink Google",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const adminUnlinkMutation = useMutation({
    mutationFn: () => unlinkGoogleAccountForUser(user.id),
    onSuccess: () => {
      toast.add({ title: "Google account unlinked" });
      onUpdated?.();
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not unlink Google",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  useEffect(() => {
    if (!isSelf || handledReturnRef.current) {
      return;
    }
    const googleReturn = parseGoogleOAuthReturn(searchParams);
    if (!googleReturn) {
      return;
    }
    handledReturnRef.current = true;

    if (googleReturn.linkSuccess) {
      toast.add({ title: "Google account linked" });
      onUpdated?.();
    } else if (googleReturn.errorCode) {
      toast.add({
        type: "error",
        title: "Could not connect Google",
        description:
          googleReturn.errorDetails ?? "Google sign-in could not be completed.",
      });
    }

    router.replace(window.location.pathname);
  }, [isSelf, onUpdated, router, searchParams, toast]);

  if (!tenant?.is_google_on) {
    return null;
  }

  const status = resolveGoogleStatus(user, Boolean(tenant.is_google_on));
  const isLinked = status === "linked";
  const linkedAt = user.google_linked_at
    ? format(new Date(user.google_linked_at), "MMM d, yyyy")
    : null;
  const isBusy =
    linkMutation.isLoading ||
    unlinkMutation.isLoading ||
    adminUnlinkMutation.isLoading;

  const description = isLinked
    ? "Google account is linked for sign-in."
    : isSelf
      ? "Connect your Google account to sign in with Google."
      : "This user has not linked Google yet. They must connect from their own profile.";

  return (
    <div
      className="grid grid-cols-1 gap-4 py-6 first:pt-0 last:pb-0 md:grid-cols-[auto_1fr_auto] md:items-start md:gap-6"
      style={{ animationDelay: "120ms" }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
        <GoogleIcon className="h-5 w-5" />
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium tracking-tight">Google</span>
          <GoogleStatusChip status={status} />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
        {isLinked && linkedAt ? (
          <p className="text-xs text-muted-foreground">Linked {linkedAt}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {!isLinked && isSelf ? (
          <Button
            variant="primary"
            size="sm"
            disabled={isBusy}
            onClick={() => linkMutation.mutate()}
          >
            Connect Google
          </Button>
        ) : null}

        {isLinked && isSelf ? (
          <ConfirmationDialog
            title="Unlink Google?"
            content="You will need to connect Google again before signing in with Google."
            onConfirm={() => unlinkMutation.mutate()}
            isLoading={unlinkMutation.isLoading}
          >
            <Button variant="primary" size="sm" disabled={isBusy}>
              Unlink
            </Button>
          </ConfirmationDialog>
        ) : null}

        {isLinked && canAdminUnlink ? (
          <ConfirmationDialog
            title="Force unlink Google?"
            content="This removes Google sign-in for this user until they connect again."
            onConfirm={() => adminUnlinkMutation.mutate()}
            isLoading={adminUnlinkMutation.isLoading}
          >
            <Button variant="primary" size="sm" disabled={isBusy}>
              Force unlink
            </Button>
          </ConfirmationDialog>
        ) : null}
      </div>
    </div>
  );
}
