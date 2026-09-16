"use client";
import { AlertDialog, Button, buttonVariants, useToast } from "@/components/primitives";

import { useState } from "react";
import {
  useDisconnectPersonalZoomOAuth,
  usePersonalZoomStatus,
  useReconnectPersonalZoomOAuth,
  useStartPersonalZoomOAuth,
} from "@/hooks/useZoomAccounts";
import type { organizationType } from "@/types/organization";
import { VideoConferencingPlatform } from "@/types/organization";

type Props = {
  organization: organizationType | null | undefined;
};

/** Staff (non-student) Zoom OAuth used when a course is set to "My Zoom". */
export function PersonalZoomOAuthCard({ organization }: Props) {
  const toast = useToast();
  const zoomRelevant =
    organization?.video_conferencing_platform ===
      VideoConferencingPlatform.zoom ||
    organization?.has_connected_zoom_account === true;

  const enabled = organization?.id != null && zoomRelevant;

  const { data: status, isLoading, isFetching } = usePersonalZoomStatus(
    Boolean(enabled),
  );
  const startOAuth = useStartPersonalZoomOAuth();
  const reconnect = useReconnectPersonalZoomOAuth();
  const disconnect = useDisconnectPersonalZoomOAuth();
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
          <h3>My Zoom</h3>
          <p>
            Link your own Zoom account to host classes marked &quot;My Zoom&quot;.
            Separate from the school&apos;s Zoom connection above.
          </p>
        </div>
        <div className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground" aria-busy="true">
              Checking your Zoom connection…
            </p>
          ) : connected ? (
            <>
              <p className="text-sm text-muted-foreground">
                Signed in as{" "}
                <span className="font-medium text-foreground">
                  {(status?.authorized_email || "").trim() ||
                    (status?.authorized_display_name || "").trim() ||
                    "Zoom"}
                </span>
                {(status?.authorized_display_name || "").trim() &&
                (status?.authorized_email || "").trim() !==
                  (status?.authorized_display_name || "").trim()
                  ? ` (${(status?.authorized_display_name || "").trim()})`
                  : null}
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
                  Reconnect Zoom
                </Button>
                <Button
                  type="button"
                  variant="danger" size="sm"
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
                  ? "Your Zoom tokens expired. Reconnect to keep using My Zoom on classes."
                  : "When a class uses My Zoom, meetings are scheduled with your Zoom account."}
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
                          : "Could not start Zoom",
                        description:
                          e instanceof Error ? e.message : undefined,
                      });
                    },
                  })
                }
              >
                {needsReconnect ? "Reconnect Zoom" : "Connect my Zoom"}
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
            <AlertDialog.Title>Disconnect My Zoom?</AlertDialog.Title>
            <AlertDialog.Description>
              Courses set to My Zoom will not be schedulable until you connect
              again.
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
                    toast.add({ description: "My Zoom disconnected." });
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
