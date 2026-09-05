"use client";
import { Sheet } from "@/components/primitives";

import type { CompletionAudience } from "@/types/completion";
import { CompletionForm } from "./completion-form";

export function CompletionSheet({
  open,
  onOpenChange,
  userId,
  roles,
  audience = "user",
  title = "Complete your profile",
  description = "A few details left. You can save each section as you go.",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: number;
  roles: string[];
  audience?: CompletionAudience;
  title?: string;
  description?: string;
}) {
  return (
    <Sheet.Root open={open} onOpenChange={onOpenChange}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup className="w-full overflow-y-auto sm:max-w-lg">
        <div>
          <Sheet.Title>{title}</Sheet.Title>
          <Sheet.Description>{description}</Sheet.Description>
        </div>
        <div className="py-4">
          {open ? (
            <CompletionForm userId={userId} roles={roles} audience={audience} />
          ) : null}
        </div>
      </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
