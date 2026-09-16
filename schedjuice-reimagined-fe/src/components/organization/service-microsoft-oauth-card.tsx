"use client";

import { AlertDialog, Button, useToast } from "@/components/primitives";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  useDisconnectServiceMicrosoftOAuth,
  useReconnectServiceMicrosoftOAuth,
  useServiceMicrosoftStatus,
  useStartServiceMicrosoftOAuth,
} from "@/hooks/useMicrosoftOAuth";
import type { organizationType } from "@/types/organization";

type Props = {
  organization: organizationType | null | undefined;
  /** Platform-internal pages: target the displayed org, not the session tenant. */
  crossTenant?: boolean;
};

/** Org-wide Microsoft service account for Teams broadcasts and fallback posting. */
export function ServiceMicrosoftOAuthCard({
  organization,
  crossTenant = false,
}: Props) {
  const toast = useToast();
  const pathname = usePathname();
  const enabled = organization?.is_microsoft_on === true;
  const targetOrganizationId =
    crossTenant && organization?.id != null ? organization.id : undefined;
  const oauthVars = {
    organizationId: targetOrganizationId,
    returnPath: crossTenant ? (pathname ?? undefined) : undefined,
  };

  const { data: status, isLoading, isFetching } = useServiceMicrosoftStatus(
    Boolean(enabled),
    targetOrganizationId,
  );
  const startOAuth = useStartServiceMicrosoftOAuth();
  const reconnect = useReconnectServiceMicrosoftOAuth();
  const disconnect = useDisconnectServiceMicrosoftOAuth();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  if (!enabled) {
    return null;
  }

  const busy =
    startOAuth.isPending ||
    reconnect.isPending ||
    disconnect.isPending ||
    isFetching;

  const connected = Boolean(status?.connected);
  const needsReconnect =
    status?.status === "needs_reconnect" && !connected;

  return (
    <>
      <div className="mt-6">
        <div>
          <h3>Microsoft service account (Teams)</h3>
          <p>
            Sign in once with the shared service account used for org-wide
            Teams announcements, backfill, and teachers who have not connected
            their own Microsoft account.
          </p>
        </div>
        <div className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground" aria-busy="true">
              Checking service account connection…
            </p>
          ) : connected ? (
            <>
              <p className="text-sm text-muted-foreground">
                Connected as{" "}
                <span className="font-medium text-foreground">
                  {(status?.authorized_upn || "").trim() || "Microsoft"}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  isLoading={reconnect.isPending}
                  disabled={busy}
                  onClick={() =>
                    reconnect.mutate(oauthVars, {
                      onError: (e) => {
                        toast.add({
                          type: "error",
                          title: "Reconnect failed",
                          description:
                            e instanceof Error ? e.message : undefined,
                        });
                      },
                    })
                  }
                >
                  Reconnect service account
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  isLoading={disconnect.isPending}
                  disabled={busy}
                  onClick={() => setConfirmDisconnect(true)}
                >
                  Disconnect
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {needsReconnect
                  ? "Service account tokens expired. Reconnect before Teams sync or backfill."
                  : "Required for Teams delivery when teachers are not connected."}
              </p>
              <Button
                type="button"
                isLoading={startOAuth.isPending || reconnect.isPending}
                disabled={busy}
                onClick={() =>
                  (needsReconnect ? reconnect : startOAuth).mutate(oauthVars, {
                    onError: (e) => {
                      toast.add({
                        type: "error",
                        title: needsReconnect
                          ? "Reconnect failed"
                          : "Could not start Microsoft sign-in",
                        description:
                          e instanceof Error ? e.message : undefined,
                      });
                    },
                  })
                }
              >
                {needsReconnect
                  ? "Reconnect service account"
                  : "Connect service account"}
              </Button>
            </>
          )}
        </div>
      </div>

      <AlertDialog.Root open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <div>
              <AlertDialog.Title>Disconnect service account?</AlertDialog.Title>
              <AlertDialog.Description>
                Teams announcements and backfill will fail until this account is
                connected again.
              </AlertDialog.Description>
            </div>
            <div>
              <AlertDialog.Close type="button">Cancel</AlertDialog.Close>
              <AlertDialog.Close
                type="button"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={disconnect.isPending}
                    onClick={() => {
                      disconnect.mutate(targetOrganizationId, {
                        onSuccess: () => {
                          setConfirmDisconnect(false);
                          toast.add({
                            description:
                              "Microsoft service account disconnected.",
                          });
                        },
                        onError: (e) => {
                          toast.add({
                            type: "error",
                            title: "Disconnect failed",
                            description:
                              e instanceof Error ? e.message : undefined,
                          });
                        },
                      });
                    }}
              >
                Disconnect
              </AlertDialog.Close>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
