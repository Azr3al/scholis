"use client";
import { Button, Dialog, Input, buttonVariants, inputClassName, useToast } from "@/components/primitives";

import { useState, useMemo } from "react";
import { useUser } from "@/hooks/useUser";
import {
  accountLabel,
  useDisconnectZoomAccount,
  useReconnectZoomAccount,
  useSetZoomDefaultHost,
  useStartZoomOAuth,
  useZoomAccountUsers,
  useZoomAccounts,
} from "@/hooks/useZoomAccounts";
import { VideoConferencingPlatform } from "@/types/organization";
import { ZoomAccountStatus, type zoomAccountType } from "@/types/zoom-account";
import { cn } from "@/lib/utils";

type ZoomAccountsSectionProps = {
  videoPlatform: VideoConferencingPlatform | null | undefined;
};

function statusClasses(status: string): string {
  switch (status) {
    case ZoomAccountStatus.active:
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
    case ZoomAccountStatus.needs_reconnect:
      return "bg-amber-500/15 text-amber-900 dark:text-amber-100";
    case ZoomAccountStatus.disconnected:
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted";
  }
}

export function ZoomAccountsSection({ videoPlatform }: ZoomAccountsSectionProps) {
  const { isAdminOrManager } = useUser();
  const toast = useToast();
  const canManage = Boolean(isAdminOrManager);
  const isZoomSchool = videoPlatform === VideoConferencingPlatform.zoom;

  const listQuery = useZoomAccounts(Boolean(canManage) && isZoomSchool);
  const startOauth = useStartZoomOAuth();
  const reconnect = useReconnectZoomAccount();
  const disconnect = useDisconnectZoomAccount();
  const setHost = useSetZoomDefaultHost();

  const [hostDialog, setHostDialog] = useState<{
    open: boolean;
    account: zoomAccountType | null;
  }>({ open: false, account: null });

  const pickerPk = hostDialog.account?.id ?? null;
  const usersQuery = useZoomAccountUsers(pickerPk, hostDialog.open);

  const [hostSearch, setHostSearch] = useState("");
  const filteredUsers = useMemo(() => {
    const rows = usersQuery.data ?? [];
    const q = hostSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (u) =>
        u.display_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q),
    );
  }, [usersQuery.data, hostSearch]);

  if (!canManage || !isZoomSchool) {
    return null;
  }

  const accounts = listQuery.data ?? [];

  return (
    <>
      <div>
        <div>
          <h3>Zoom meetings</h3>
          <p>
            Connect the school’s Zoom account used for class links and attendance.
            You must sign in with a Zoom administrator account when prompted.
          </p>
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              isLoading={startOauth.isPending}
              disabled={startOauth.isPending}
              onClick={() => {
                startOauth.mutate(undefined, {
                  onError: (e) => {
                    toast.add({
                      type: "error",
                      title: "Could not start connection",
                      description:
                        e instanceof Error ? e.message : "Something went wrong.",
                    });
                  },
                });
              }}
            >
              Connect Zoom
            </Button>
          </div>

          {listQuery.isLoading && (
            <p className="text-sm text-muted-foreground" aria-busy="true">
              Loading connected accounts…
            </p>
          )}

          {listQuery.isError && (
            <p className="text-sm text-destructive">
              {listQuery.error instanceof Error
                ? listQuery.error.message
                : "Could not load Zoom accounts."}
            </p>
          )}

          {accounts.length === 0 && !listQuery.isLoading && !listQuery.isError && (
            <p className="text-sm text-muted-foreground">
              No Zoom accounts connected yet.
            </p>
          )}

          <ul className="space-y-3">
            {accounts.map((acc) => (
              <li
                key={acc.id}
                className="rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{accountLabel(acc)}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          statusClasses(acc.status),
                        )}
                      >
                        {acc.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Default host:{" "}
                      {acc.has_default_host
                        ? `${acc.default_host_name || "—"} (${acc.default_host_email || acc.default_host_zoom_user_id})`
                        : "Not set — choose a host before scheduling class meetings."}
                    </p>
                    {acc.last_error ? (
                      <p className="text-xs text-destructive">{acc.last_error}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={
                        acc.status === ZoomAccountStatus.disconnected ||
                        setHost.isPending
                      }
                      onClick={() => {
                        setHostSearch("");
                        setHostDialog({ open: true, account: acc });
                      }}
                    >
                      Choose meeting host
                    </Button>
                    <Button
                      type="button"
                      variant="secondary" size="sm"
                      isLoading={reconnect.isPending}
                      disabled={reconnect.isPending}
                      onClick={() =>
                        reconnect.mutate(acc.id, {
                          onError: (e) => {
                            toast.add({
                              type: "error",
                              description:
                                e instanceof Error ? e.message : undefined,
                            });
                          },
                        })
                      }
                    >
                      Reconnect
                    </Button>
                    <Button
                      type="button"
                      variant="danger" size="sm"
                      isLoading={disconnect.isPending}
                      disabled={disconnect.isPending}
                      onClick={() =>
                        disconnect.mutate(acc.id, {
                          onError: (e) => {
                            toast.add({
                              type: "error",
                              description:
                                e instanceof Error ? e.message : undefined,
                            });
                          },
                        })
                      }
                    >
                      Disconnect
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Dialog.Root
        open={hostDialog.open}
        onOpenChange={(open) =>
          setHostDialog((s) => ({ ...s, open, account: open ? s.account : null }))
        }
      >
        <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="max-h-[min(80vh,560px)] overflow-y-auto sm:max-w-md">
          <div>
            <Dialog.Title>Choose meeting host</Dialog.Title>
            <Dialog.Description>
              Class Zoom meetings are created on this host’s calendar. Pick a Zoom
              user from your organization’s account.
            </Dialog.Description>
          </div>
          <div className="space-y-2">
            <Input
              placeholder="Search by name or email…"
              value={hostSearch}
              onChange={(e) => setHostSearch(e.target.value)}
              disabled={usersQuery.isLoading}
            />
            {usersQuery.isLoading && (
              <p className="text-sm text-muted-foreground" aria-busy="true">
                Loading Zoom users…
              </p>
            )}
            {usersQuery.isError && (
              <p className="text-sm text-destructive">
                {usersQuery.error instanceof Error
                  ? usersQuery.error.message
                  : "Could not load users."}
              </p>
            )}
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-1">
              {filteredUsers.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-sm px-2 py-2 text-left text-sm transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                    )}
                    disabled={setHost.isPending}
                    onClick={() => {
                      if (!hostDialog.account) return;
                      setHost.mutate(
                        {
                          accountPk: hostDialog.account.id,
                          defaultHostZoomUserId: u.id,
                        },
                        {
                          onSuccess: () => {
                            setHostDialog({ open: false, account: null });
                            toast.add({ description: "Default host saved." });
                          },
                          onError: (e) => {
                            toast.add({
                              type: "error",
                              description:
                                e instanceof Error ? e.message : undefined,
                            });
                          },
                        },
                      );
                    }}
                  >
                    <span className="font-medium">{u.display_name || u.email}</span>
                    <span className="block text-xs text-muted-foreground">
                      {u.email}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {filteredUsers.length === 0 &&
              !usersQuery.isLoading &&
              !usersQuery.isError && (
                <p className="text-sm text-muted-foreground">
                  {hostSearch.trim()
                    ? "No matching users for that search."
                    : (usersQuery.data?.length ?? 0) === 0
                      ? "Zoom returned no users. Add scopes that allow listing users on your Zoom account (the REST Users list). Also confirm this account has users with licenses—not only the person who connected."
                      : "No matching users."}
                </p>
              )}
          </div>
          <div>
            <Button
              type="button"
              variant="secondary" onClick={() => setHostDialog({ open: false, account: null })}
            >
              Close
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
