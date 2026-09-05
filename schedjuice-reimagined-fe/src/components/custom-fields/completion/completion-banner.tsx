"use client";
import { Button, buttonVariants } from "@/components/primitives";
import { Progress } from "@/components/misc/progress";

import { useProfileCompleteness } from "@/hooks/use-profile-completeness";
import {
  missingKeysForAudience,
  nextMissingLabel,
} from "@/lib/custom-fields/completion";
import { Xmark as X } from "iconoir-react";
import { useState } from "react";
import { CompletionSheet } from "./completion-sheet";

const dismissKey = (userId: number) => `completion-dismissed-${userId}`;

export function CompletionBanner({
  userId,
  roles,
}: {
  userId: number;
  roles: string[];
}) {
  const { data } = useProfileCompleteness(userId);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.sessionStorage.getItem(dismissKey(userId)) === "1",
  );

  if (!data || data.percent >= 100 || dismissed) return null;

  const userMissing = data.missing.filter(
    (m) => missingKeysForAudience([m], "user").size > 0,
  );
  if (userMissing.length === 0) return null;

  const next = nextMissingLabel(userMissing);

  const dismiss = () => {
    setDismissed(true);
    window.sessionStorage.setItem(dismissKey(userId), "1");
  };

  return (
    <div className="rounded-lg bg-surface-sunken/60 px-4 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Finish your profile</span>
            <span className="font-mono text-xs text-muted-foreground">
              {data.percent}%
            </span>
          </div>
          <Progress value={data.percent} className="h-1.5" />
          <p className="text-xs text-muted-foreground">
            {userMissing.length} thing{userMissing.length === 1 ? "" : "s"} left
            {next ? ` — next: ${next}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" onClick={() => setOpen(true)}>
            Complete profile
          </Button>
          <Button
            type="button"
            size="sm" variant="ghost"
            aria-label="Dismiss"
            onClick={dismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <CompletionSheet
        open={open}
        onOpenChange={setOpen}
        userId={userId}
        roles={roles}
      />
    </div>
  );
}
