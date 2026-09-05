"use client";

import type { RefObject } from "react";
import { Dialog } from "@/components/primitives/dialog";
import { Popover } from "@/components/primitives/popover";
import { Button } from "@/components/primitives/button";
import { getFindPageWelcomeShortcutHint } from "@/lib/find-page-shortcut-label";

type Props = {
  welcomeOpen: boolean;
  onWelcomeDismiss: () => void;
  coachmarkOpen: boolean;
  onCoachmarkDismiss: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
};

export function FindPageOnboarding({
  welcomeOpen,
  onWelcomeDismiss,
  coachmarkOpen,
  onCoachmarkDismiss,
  triggerRef,
}: Props) {
  return (
    <>
      <Dialog.Root
        open={welcomeOpen}
        onOpenChange={(next) => {
          if (!next) onWelcomeDismiss();
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.Title>Find a page</Dialog.Title>
            <Dialog.Description>
              Jump to any screen from the search bar at the top.{" "}
              {getFindPageWelcomeShortcutHint()}
            </Dialog.Description>
            <div className="flex justify-end">
              <Button type="button" onClick={onWelcomeDismiss}>
                Got it
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <Popover.Root
        open={coachmarkOpen}
        onOpenChange={(next) => {
          if (!next) onCoachmarkDismiss();
        }}
      >
        <Popover.Portal>
          <Popover.Positioner
            anchor={triggerRef}
            side="bottom"
            align="center"
            sideOffset={8}
          >
            <Popover.Popup className="max-w-xs">
              <Popover.Arrow />
              <Popover.Title className="font-serif text-lg">Find a page</Popover.Title>
              <Popover.Description className="mt-1 text-sm text-text-secondary">
                Click here anytime to find a page.
              </Popover.Description>
              <div className="mt-4 flex justify-end">
                <Button type="button" size="sm" onClick={onCoachmarkDismiss}>
                  Got it
                </Button>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}
