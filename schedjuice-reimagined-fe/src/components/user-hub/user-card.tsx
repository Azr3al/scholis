"use client";
import { Button } from "@/components/primitives";

import Link from "next/link";
import { Mail, Phone } from "iconoir-react";
import { useState } from "react";
import { AdminCompletionSheet } from "@/components/custom-fields/completion/admin-completion-sheet";
import { formatDate } from "@/helpers/date";
import { HubUserRow } from "@/types/user-hub";
import { cn } from "@/lib/utils";

interface Props {
  user: HubUserRow;
  showCompletionActions?: boolean;
}

function roleLabel(r: string) {
  return r.charAt(0).toUpperCase() + r.slice(1);
}

export function UserHubCard({ user, showCompletionActions = false }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const displayName = user.alternative_name?.trim() || user.name;
  const subtitle = user.alternative_name?.trim() ? user.name : null;
  const incomplete =
    typeof user.profile_completeness === "number" &&
    user.profile_completeness < 100;

  return (
    <>
      <div
        className={cn(
          "rounded-lg border border-border bg-surface text-text-primary",
          "relative h-full transition-colors hover:bg-muted/40",
          !user.is_active && "opacity-70",
        )}
      >
        <Link
          href={`/users/${user.id}`}
          className="absolute inset-0 z-0 rounded-xl"
          aria-label={`View ${displayName}`}
        />
        <div className="relative z-10 flex h-full flex-col gap-4 p-5 pointer-events-none">
          <div className="min-w-0 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium leading-snug line-clamp-2">{displayName}</p>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className="inline-flex items-center rounded-md border border-border bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-secondary"
                >
                  {user.is_active ? "Active" : "Disabled"}
                </span>
                {incomplete && (
                  <span className="font-mono text-[10px] text-amber-600">
                    {user.profile_completeness}%
                  </span>
                )}
              </div>
            </div>
            {subtitle && (
              <p className="truncate text-xs text-text-muted">{subtitle}</p>
            )}
          </div>

          <div className="min-w-0 space-y-1.5">
            <p className="flex items-center gap-1.5 truncate text-xs text-text-muted">
              <Mail className="h-3 w-3 shrink-0" />
              {user.email}
            </p>
            {user.phone_number && (
              <p className="flex items-center gap-1.5 truncate text-xs text-text-muted">
                <Phone className="h-3 w-3 shrink-0" />
                {user.phone_number}
              </p>
            )}
          </div>

          <div className="mt-auto flex items-end justify-between gap-2">
            {(user.roles ?? []).length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {(user.roles ?? []).slice(0, 3).map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center rounded-md border border-border bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-text-secondary"
                  >
                    {roleLabel(r)}
                  </span>
                ))}
              </div>
            ) : (
              <span />
            )}
            {user.created_at ? (
              <p className="shrink-0 text-[10px] text-text-muted">
                Joined {formatDate(user.created_at, "MMM yyyy")}
              </p>
            ) : null}
          </div>

          {showCompletionActions && incomplete && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="pointer-events-auto mt-1 w-full text-xs"
              onClick={() => setSheetOpen(true)}
            >
              Complete profile
            </Button>
          )}
        </div>
      </div>

      {showCompletionActions && (
        <AdminCompletionSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          userId={user.id}
          roles={user.roles ?? []}
          userName={displayName}
        />
      )}
    </>
  );
}
