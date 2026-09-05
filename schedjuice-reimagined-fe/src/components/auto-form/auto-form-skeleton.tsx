"use client";

import { Skeleton } from "@/components/primitives";
import { cn } from "@/lib/utils";

import type { AutoFormSkeletonProps } from "./types";

/**
 * Group-aware loading skeleton — mirrors live AutoForm group/field layout
 * (not a flat `rows={N}` stack).
 */
export function AutoFormSkeleton({
  groups,
  className,
  saveMode = "create",
  showCreateFooter = saveMode === "create",
}: AutoFormSkeletonProps) {
  return (
    <div
      className={cn("w-full", className)}
      aria-busy="true"
      aria-label="Loading form fields"
      data-slot="auto-form-skeleton"
    >
      {/* Match live AutoForm: edit save-tick reserved above groups (no layout jump). */}
      {saveMode === "edit" ? (
        <div
          className="mb-4 flex min-h-5 items-center"
          data-slot="auto-form-skeleton-save-tick"
          aria-hidden
        />
      ) : null}
      <div className="flex w-full flex-col gap-8">
        {groups.map((group) => (
          <section
            key={group.id}
            data-slot="auto-form-skeleton-group"
            data-group-id={group.id}
            className="flex flex-col gap-4"
          >
            <div className="space-y-1">
              <h3
                className="text-base font-medium text-text-primary"
                data-slot="auto-form-skeleton-group-title"
              >
                {group.title}
              </h3>
              {group.description ? (
                <p className="text-sm text-text-muted">{group.description}</p>
              ) : null}
            </div>
            <div className="flex w-full flex-col gap-5 max-sm:gap-4">
              {group.fields.map((fieldName) => (
                <div
                  key={fieldName}
                  className="space-y-2"
                  data-slot="auto-form-skeleton-field"
                  data-field={fieldName}
                >
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-10 w-full max-w-xl" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      {showCreateFooter ? (
        <div
          className="mt-6 flex min-h-10 items-center gap-3"
          data-slot="auto-form-skeleton-footer"
          aria-hidden
        >
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-20" />
        </div>
      ) : null}
    </div>
  );
}
