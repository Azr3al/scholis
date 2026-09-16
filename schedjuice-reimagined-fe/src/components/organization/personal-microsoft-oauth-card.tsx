"use client";

import { AlertDialog, Button, useToast } from "@/components/primitives";
import { useState } from "react";

import {
  useDisconnectPersonalMicrosoftOAuth,
  usePersonalMicrosoftStatus,
  useReconnectPersonalMicrosoftOAuth,
  useStartPersonalMicrosoftOAuth,
} from "@/hooks/useMicrosoftOAuth";
import type { organizationType } from "@/types/organization";

type Props = {
  organization: organizationType | null | undefined;
};

/** Teacher Microsoft OAuth for posting course announcements as themselves in Teams. */
export function PersonalMicrosoftOAuthCard({ organization }: Props) {
  const toast = useToast();
  const enabled =
    organization?.is_microsoft_on === true &&
    organization?.is_teams_creation_enabled !== false;

  const { data: status, isLoading, isFetching } = usePersonalMicrosoftStatus(
    Boolean(enabled),
  );
  const startOAuth = useStartPersonalMicrosoftOAuth();
  const reconnect = useReconnectPersonalMicrosoftOAuth();
  const disconnect = useDisconnectPersonalMicrosoftOAuth();
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
          <h3>My Microsoft (Teams)</h3>
          <p>
            Microsoft sign-in connects your account for posting course announcements
            to Teams as yourself. Use this section to review your connection,
            reconnect after expiry, or disconnect.
          </p>
        </div>
        <div className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground" aria-busy="true">
              Checking your Microsoft connection…
            </p>
          ) : connected ? (
            <>
              <p className="text-sm text-muted-foreground">
                Signed in as{" "}
                <span className="font-medium text-foreground">
                  {(status?.authorized_upn || "").trim() ||
                    (status?.authorized_display_name || "").trim() ||
                    "Microsoft"}
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
                    reconnect.mutate(undefined, {
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
                  Reconnect Microsoft
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
                  ? "Your Microsoft tokens expired. Reconnect to keep posting as yourself in Teams."
                  : "One-time sign-in; admin consent removes the permissions prompt for your tenant."}
              </p>
              <Button
                type="button"
                isLoading={startOAuth.isPending || reconnect.isPending}
                disabled={busy}
                onClick={() =>
                  (needsReconnect ? reconnect : startOAuth).mutate(undefined, {
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
                {needsReconnect ? "Reconnect Microsoft" : "Connect Microsoft"}
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
              <AlertDialog.Title>Disconnect Microsoft?</AlertDialog.Title>
              <AlertDialog.Description>
                New Teams posts from your courses will stop using your Microsoft
                identity until you connect again from a course post.
              </AlertDialog.Description>
            </div>
            <div>
              <AlertDialog.Close type="button">Cancel</AlertDialog.Close>
              <AlertDialog.Close
                type="button"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={disconnect.isPending}
                onClick={() => {
                  disconnect.mutate(undefined, {
                    onSuccess: () => {
                      setConfirmDisconnect(false);
                      toast.add({ description: "Microsoft disconnected." });
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
