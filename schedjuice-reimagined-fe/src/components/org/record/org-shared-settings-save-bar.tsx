"use client";

import { Button } from "@/components/primitives";
import { cn } from "@/lib/utils";

export function OrgSharedSettingsSaveBar({
  dirtySectionCount,
  isSaving,
  onSave,
  onDiscard,
  className,
}: {
  dirtySectionCount: number;
  isSaving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  className?: string;
}) {
  if (dirtySectionCount <= 0) return null;

  const label =
    dirtySectionCount === 1
      ? "1 section with unsaved changes"
      : `${dirtySectionCount} sections with unsaved changes`;

  return (
    <div
      role="region"
      aria-label="Unsaved organization settings"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 md:bottom-6",
        className,
      )}
    >
      <div className="pointer-events-auto flex w-full max-w-xl flex-col gap-3 rounded-xl border border-border bg-surface-elevated p-4 shadow-[var(--shadow-elevated)] sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-text-primary">{label}</p>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isSaving}
            onClick={onDiscard}
          >
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            isLoading={isSaving}
            onClick={onSave}
          >
            Save all
          </Button>
        </div>
      </div>
    </div>
  );
}
