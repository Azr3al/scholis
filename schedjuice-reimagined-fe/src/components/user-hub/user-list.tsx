"use client";
import { Skeleton } from "@/components/primitives";

import Link from "next/link";
import { Loader } from "@/components/form/loader";
import { HubUserRow } from "@/types/user-hub";
import { cn } from "@/lib/utils";

interface Props {
  rows: HubUserRow[];
  isLoading: boolean;
  isRefetching?: boolean;
}

function roleLabel(r: string) {
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function UserListSkeleton() {
  return (
    <div className="space-y-0 rounded-lg border border-border">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-border px-4 py-3 last:border-b-0">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function UserList({ rows, isLoading, isRefetching = false }: Props) {
  if (isLoading) {
    return <UserListSkeleton />;
  }

  return (
    <div className="relative">
      <div
        className={cn(
          "overflow-x-auto rounded-lg border border-border",
          isRefetching && "pointer-events-none opacity-50",
        )}
      >
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-text-muted">
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Phone</th>
              <th className="px-4 py-2.5">Roles</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((user) => {
              const displayName = user.alternative_name?.trim() || user.name;
              const incomplete =
                typeof user.profile_completeness === "number" &&
                user.profile_completeness < 100;
              return (
                <tr
                  key={user.id}
                  className={cn(
                    "border-b border-border/60 transition-colors last:border-b-0 hover:bg-surface-hover",
                    !user.is_active && "opacity-70",
                  )}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/users/${user.id}`}
                      className="font-medium text-text-primary hover:underline"
                    >
                      {displayName}
                    </Link>
                    {incomplete ? (
                      <span className="ml-2 font-mono text-[10px] text-warning-foreground">
                        {user.profile_completeness}%
                      </span>
                    ) : null}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-text-secondary">
                    {user.email}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{user.phone_number ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(user.roles ?? []).slice(0, 3).map((r) => (
                        <span
                          key={r}
                          className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] text-text-secondary"
                        >
                          {roleLabel(r)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        user.is_active ? "text-accent" : "text-danger",
                      )}
                    >
                      {user.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {isRefetching ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader />
        </div>
      ) : null}
    </div>
  );
}
