"use client";

import { Button, Dialog, buttonVariants } from "@/components/primitives";
import { openTelegramDeepLink } from "@/lib/linking/open-telegram-deep-link";
import { cn } from "@/lib/utils";

export function TelegramLinkPromptDialog({
  open,
  deepLink,
  onOpenChange,
}: {
  open: boolean;
  deepLink: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  if (!deepLink) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="sm:max-w-md">
          <div>
            <Dialog.Title>Continue in Telegram</Dialog.Title>
            <Dialog.Description>
              Open the bot chat and tap <strong>Start</strong>. This page will
              update when linking completes.
            </Dialog.Description>
          </div>
          <div className="flex flex-col gap-2">
            <a
              href={deepLink}
              className={cn(buttonVariants({ variant: "primary" }), "w-full")}
              onClick={(event) => {
                event.preventDefault();
                openTelegramDeepLink(deepLink, { preferAppHandoff: true });
              }}
            >
              Open Telegram
            </a>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Not now
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
