import { AutoFormSkeleton } from "@/components/auto-form";
import { Skeleton } from "@/components/primitives";
import { USER_CREATE_SKELETON_GROUPS } from "@/lib/user-create-skeleton-groups";
import { cn } from "@/lib/utils";

/**
 * Loading UI for UserForm create step 1 — one Profile section + non-sticky
 * Add person / Cancel footer (not AutoForm's sticky Submit/Cancel).
 */
export function UserCreateFormSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn("mx-auto w-full max-w-3xl space-y-8 px-4 sm:px-6", className)}
      aria-busy="true"
      aria-label="Loading person form"
    >
      <AutoFormSkeleton
        groups={USER_CREATE_SKELETON_GROUPS}
        saveMode="create"
        showCreateFooter={false}
      />
      {/* Match live UserForm create footer: border-t, Add person + Cancel. */}
      <div
        className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:flex-wrap sm:items-center"
        data-slot="user-create-skeleton-footer"
        aria-hidden
      >
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-36" />
      </div>
    </div>
  );
}
