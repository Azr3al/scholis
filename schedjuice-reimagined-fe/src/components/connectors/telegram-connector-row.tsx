"use client";
import { Button, Skeleton, useToast } from "@/components/primitives";

import {
  createTelegramLinkToken,
  createTelegramLinkTokenForUser,
  unlinkTelegramAccount,
  unlinkTelegramAccountForUser,
} from "@/app/client-api/telegram";
import ConfirmationDialog from "@/components/misc/confirmation-dialog";
import { isSuperAdmin } from "@/helpers/authorization";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { isMobileUserAgent } from "@/lib/linking/open-in-app-prompt-state";
import { openTelegramDeepLink } from "@/lib/linking/open-telegram-deep-link";
import { organizationType } from "@/types/organization";
import { accountType } from "@/types/user";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { useCallback, useEffect, useRef, useState } from "react";
import { TelegramIcon } from "./connector-icons";
import { TelegramLinkPromptDialog } from "./telegram-link-prompt-dialog";
import {
  resolveTelegramStatus,
  TelegramStatusChip,
} from "./telegram-status-chip";

const POLL_INTERVAL_MS = 5000;
const POLL_DURATION_MS = 120000;

/**
 * Telegram connector row for Telegram-enabled tenants.
 * Users connect/unlink on their own profile; superadmins can generate links
 * and force-unlink for other users.
 */
export function TelegramConnectorRow({
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
  const [awaitingLink, setAwaitingLink] = useState(false);
  const [pendingDeepLink, setPendingDeepLink] = useState<string | null>(null);
  const [linkPromptOpen, setLinkPromptOpen] = useState(false);
  const pollStartedAt = useRef<number | null>(null);
  const isSelf = viewerAccount.email === user.email;
  const canAdminLink = !isSelf && isSuperAdmin(viewerAccount);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await createTelegramLinkToken();
      const payload = res.data as {
        deep_link?: string;
        data?: { deep_link?: string };
      };
      return payload.data?.deep_link ?? payload.deep_link;
    },
    onSuccess: (deepLink: string | undefined) => {
      if (!deepLink) {
        toast.add({
          type: "error",
          title: "Could not start Telegram link",
          description: "No deep link returned from the server.",
        });
        return;
      }
      setPendingDeepLink(deepLink);
      setAwaitingLink(true);
      pollStartedAt.current = Date.now();
      const isMobile =
        typeof navigator !== "undefined" &&
        isMobileUserAgent(navigator.userAgent);
      if (isMobile) {
        setLinkPromptOpen(true);
        return;
      }
      openTelegramDeepLink(deepLink);
      toast.add({
        title: "Continue in Telegram",
        description:
          "Open the bot chat and tap Start. This page will update when linking completes.",
      });
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not connect Telegram",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: () => unlinkTelegramAccount(),
    onSuccess: () => {
      setAwaitingLink(false);
      setPendingDeepLink(null);
      setLinkPromptOpen(false);
      pollStartedAt.current = null;
      toast.add({ title: "Telegram account unlinked" });
      onUpdated?.();
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not unlink Telegram",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const adminLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await createTelegramLinkTokenForUser(user.id);
      const payload = res.data as {
        deep_link?: string;
        data?: { deep_link?: string };
      };
      return payload.data?.deep_link ?? payload.deep_link;
    },
    onSuccess: async (deepLink: string | undefined) => {
      if (!deepLink) {
        toast.add({
          type: "error",
          title: "Could not generate Telegram link",
          description: "No deep link returned from the server.",
        });
        return;
      }
      try {
        await navigator.clipboard.writeText(deepLink);
        toast.add({
          title: "Link copied",
          description:
            "Send it to the teacher. They must tap Start in Telegram.",
        });
      } catch {
        toast.add({
          type: "error",
          title: "Could not copy link",
          description: deepLink,
        });
      }
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not generate Telegram link",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const adminUnlinkMutation = useMutation({
    mutationFn: () => unlinkTelegramAccountForUser(user.id),
    onSuccess: () => {
      toast.add({ title: "Telegram account unlinked" });
      onUpdated?.();
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not unlink Telegram",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const stopPolling = useCallback(() => {
    setAwaitingLink(false);
    setPendingDeepLink(null);
    setLinkPromptOpen(false);
    pollStartedAt.current = null;
  }, []);

  useEffect(() => {
    if (!awaitingLink || !onUpdated) return;

    const tick = () => {
      if (
        pollStartedAt.current &&
        Date.now() - pollStartedAt.current > POLL_DURATION_MS
      ) {
        stopPolling();
        return;
      }
      onUpdated();
    };

    const intervalId = window.setInterval(tick, POLL_INTERVAL_MS);
    const onFocus = () => tick();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        tick();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [awaitingLink, onUpdated, stopPolling]);

  useEffect(() => {
    if (awaitingLink && user.telegram_user_id) {
      stopPolling();
      toast.add({ title: "Telegram linked" });
    }
  }, [awaitingLink, user.telegram_user_id, stopPolling, toast]);

  const handleLinkPromptOpenChange = useCallback((open: boolean) => {
    setLinkPromptOpen(open);
  }, []);

  if (!tenant?.is_telegram_on) {
    return null;
  }

  const status = resolveTelegramStatus(user, Boolean(tenant.is_telegram_on));
  const isLinked = status === "linked";
  const linkedAt = user.telegram_linked_at
    ? format(new Date(user.telegram_linked_at), "MMM d, yyyy")
    : null;
  const isBusy =
    connectMutation.isLoading ||
    unlinkMutation.isLoading ||
    adminLinkMutation.isLoading ||
    adminUnlinkMutation.isLoading;

  const description = isLinked
    ? "Telegram account is linked for notifications and sign-in."
    : isSelf
      ? "Connect your Telegram account to sign in with Telegram and receive notifications."
      : canAdminLink
        ? "Generate a link and send it to the user. They must tap Start in Telegram."
        : "This user has not linked Telegram yet. They must connect from their own profile.";

  return (
    <>
    <TelegramLinkPromptDialog
      open={linkPromptOpen}
      deepLink={pendingDeepLink}
      onOpenChange={handleLinkPromptOpenChange}
    />
    <div
      className="grid grid-cols-1 gap-4 py-6 first:pt-0 last:pb-0 md:grid-cols-[auto_1fr_auto] md:items-start md:gap-6"
      style={{ animationDelay: "80ms" }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
        <TelegramIcon className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium tracking-tight">Telegram</span>
          <TelegramStatusChip status={status} />
          {awaitingLink && !isLinked ? (
            <span className="text-xs text-muted-foreground animate-pulse">
              Waiting for link…
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>

        {isLinked ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {user.telegram_username ? (
              <span>
                Username:{" "}
                <span className="font-mono text-foreground/80">
                  @{user.telegram_username}
                </span>
              </span>
            ) : null}
            {linkedAt ? <span>Linked {linkedAt}</span> : null}
          </div>
        ) : null}

        {isBusy ? (
          <div className="space-y-2 pt-1" aria-hidden>
            <Skeleton className="h-9 w-36" />
          </div>
        ) : null}
      </div>

      {isSelf ? (
        <div className="flex flex-wrap gap-2 md:justify-end md:pt-0.5">
          {!isLinked ? (
            <Button
              type="button"
              size="sm"
              onClick={() => connectMutation.mutate()}
              isLoading={connectMutation.isLoading}
              className="active:scale-[0.98] transition-transform"
            >
              Connect Telegram
            </Button>
          ) : (
            <ConfirmationDialog
              title="Unlink Telegram?"
              content="You will stop receiving Telegram notifications and may need to rejoin course groups after linking again."
              onConfirm={() => unlinkMutation.mutate()}
              isLoading={unlinkMutation.isLoading}
            >
              <Button
                type="button"
                size="sm"
                variant="secondary" isLoading={unlinkMutation.isLoading}
                className="active:scale-[0.98] transition-transform"
              >
                Disconnect
              </Button>
            </ConfirmationDialog>
          )}
        </div>
      ) : null}

      {canAdminLink ? (
        <div className="flex flex-wrap gap-2 md:justify-end md:pt-0.5">
          {!isLinked ? (
            <Button
              type="button"
              size="sm"
              onClick={() => adminLinkMutation.mutate()}
              isLoading={adminLinkMutation.isLoading}
              className="active:scale-[0.98] transition-transform"
            >
              Generate link
            </Button>
          ) : (
            <ConfirmationDialog
              title="Force unlink Telegram?"
              content="This clears the teacher's Telegram binding. They will need a new link to reconnect."
              onConfirm={() => adminUnlinkMutation.mutate()}
              isLoading={adminUnlinkMutation.isLoading}
            >
              <Button
                type="button"
                size="sm"
                variant="secondary" isLoading={adminUnlinkMutation.isLoading}
                className="active:scale-[0.98] transition-transform"
              >
                Force unlink
              </Button>
            </ConfirmationDialog>
          )}
        </div>
      ) : null}
    </div>
    </>
  );
}
