"use client";
import { Skeleton } from "@/components/primitives";

import { Loader } from "@/components/form/loader";
import { UserHubCard } from "./user-card";
import { HubUserRow } from "@/types/user-hub";

interface Props {
  rows: HubUserRow[];
  isLoading: boolean;
  isRefetching?: boolean;
  showCompletionActions?: boolean;
}

function UserHubCardSkeleton() {
  return (
    <div className="h-full rounded-xl border bg-surface p-5">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <div className="flex flex-wrap gap-1 pt-2">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function UserGrid({
  rows,
  isLoading,
  isRefetching = false,
  showCompletionActions = false,
}: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <UserHubCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  return (
    <div className="relative">
      <div
        className={
          isRefetching
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-50 pointer-events-none"
            : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        }
      >
        {(rows ?? []).map((user) => (
          <UserHubCard
            key={user.id}
            user={user}
            showCompletionActions={showCompletionActions}
          />
        ))}
      </div>
      {isRefetching && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader />
        </div>
      )}
    </div>
  );
}
