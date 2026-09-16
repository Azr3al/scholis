"use client";
import { Button, Dialog, buttonVariants } from "@/components/primitives";

import { useEffect, useMemo, useState } from "react";

import { buildAppDeepLink } from "@/lib/linking/build-app-deep-link";
import {
  dismissOpenInAppPromptForSession,
  isColdDocumentNavigation,
  isMobileUserAgent,
  isOpenInAppPromptDismissed,
  isRegisteredUniversalLinkHost,
  isWebAuthPath,
} from "@/lib/linking/open-in-app-prompt-state";
import { resolveUniversalLinkHost } from "@/config/universal-link-registry";

const VARIANT_APP_LABEL: Record<string, string> = {
  schedjuice: "Schedjuice",
  teachersucenter: "TSIS Connect",
};

export function OpenInAppPrompt() {
  const [open, setOpen] = useState(false);

  const appLabel = useMemo(() => {
    if (typeof window === "undefined") {
      return "Schedjuice";
    }
    const cfg = resolveUniversalLinkHost(window.location.host);
    if (cfg) {
      return VARIANT_APP_LABEL[cfg.variant] ?? "Schedjuice";
    }
    return document.title || "Schedjuice";
  }, [open]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const host = window.location.host;
    if (!isRegisteredUniversalLinkHost(host)) {
      return;
    }
    if (!isMobileUserAgent(navigator.userAgent)) {
      return;
    }
    if (isOpenInAppPromptDismissed()) {
      return;
    }
    if (!isColdDocumentNavigation()) {
      return;
    }
    if (isWebAuthPath(window.location.pathname)) {
      return;
    }
    setOpen(true);
  }, []);

  const handleContinueInBrowser = () => {
    dismissOpenInAppPromptForSession();
    setOpen(false);
  };

  const handleOpenInApp = () => {
    const deepLink = buildAppDeepLink({
      host: window.location.host,
      pathname: window.location.pathname,
      search: window.location.search,
    });
    if (!deepLink) {
      return;
    }
    window.location.href = deepLink;
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="sm:max-w-md">
        <div>
          <Dialog.Title>Open in {appLabel}?</Dialog.Title>
          <Dialog.Description>
            You can use the mobile app or continue here in your browser.
          </Dialog.Description>
        </div>
        <div className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleOpenInApp}
          >
            Open in app
          </Button>
          <Button
            type="button"
            variant="secondary" className="w-full text-foreground"
            onClick={handleContinueInBrowser}
          >
            Continue in browser
          </Button>
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
