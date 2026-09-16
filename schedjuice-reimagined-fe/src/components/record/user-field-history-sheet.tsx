"use client";

import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Sheet } from "@/components/primitives";
import {
  EmptyCopy,
  EmptyState,
  EMPTY_COPY_PRESETS,
} from "@/components/primitives/empty";
import { listUserImages } from "@/app/client-api/user-images";
import { listUserFieldChanges } from "@/app/client-api/user-field-changes";
import { mergePeopleHistoryEntries } from "@/lib/users/field-history";
import { staggerItem, staggerItemOpacity, staggerList } from "@/lib/sj/motion";
import { STEWARD_FIELD_LABELS } from "@/lib/users/steward-fields";

function formatWhen(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function fieldLabel(fieldKey: string) {
  return STEWARD_FIELD_LABELS[fieldKey] ?? fieldKey;
}

export function UserFieldHistorySheet({
  userId,
  subjectName,
  open,
  onOpenChange,
}: {
  userId: number;
  subjectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reducedMotion = useReducedMotion();
  const itemVariants = reducedMotion ? staggerItemOpacity : staggerItem;

  const changesQuery = useQuery({
    queryKey: ["user-field-changes", userId],
    queryFn: () => listUserFieldChanges(userId),
    enabled: open,
  });

  const imagesQuery = useQuery({
    queryKey: ["user-image-history", userId, "id_image"],
    queryFn: async () => {
      try {
        return await listUserImages(userId, "id_image");
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 403) {
          return { items: [], count: 0 };
        }
        throw error;
      }
    },
    enabled: open,
  });

  const changes = changesQuery.data;
  const unavailable =
    changes != null && "unavailable" in changes && changes.unavailable;
  const merged =
    changes != null && !("unavailable" in changes)
      ? mergePeopleHistoryEntries(
          changes.items,
          imagesQuery.data?.items ?? [],
          fieldLabel,
        )
      : [];
  const isLoading = changesQuery.isLoading || imagesQuery.isLoading;

  return (
    <Sheet.Root open={open} onOpenChange={onOpenChange}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
          <Sheet.Title>Field history</Sheet.Title>
          <Sheet.Description>
            Identity changes for {subjectName}, newest first.
          </Sheet.Description>
          <div className="min-h-64 px-1 pb-2 pt-1">
            {isLoading ? (
              <div className="flex flex-col gap-4 py-2" aria-busy="true">
                <div className="h-14 rounded-md bg-surface-hover" />
                <div className="h-14 rounded-md bg-surface-hover" />
                <div className="h-14 rounded-md bg-surface-hover" />
              </div>
            ) : unavailable ? (
              <EmptyState>
                <EmptyCopy
                  enBefore=""
                  enHighlight="Not available"
                  enAfter=""
                  myBefore=""
                  myHighlight="မရနိုင်"
                  myAfter="ပါ"
                />
              </EmptyState>
            ) : merged.length ? (
              <AnimatePresence mode="wait">
                <motion.ul
                  key="history-list"
                  variants={staggerList}
                  initial="hidden"
                  animate="show"
                  className="divide-y divide-border-subtle"
                >
                  {merged.map((row) => (
                    <motion.li
                      key={row.key}
                      variants={itemVariants}
                      className="flex flex-col gap-1 py-4 first:pt-1"
                    >
                      <p className="text-sm font-medium text-text-primary">
                        {row.label}
                      </p>
                      <p className="text-sm text-text-secondary">
                        <span className="text-text-muted">
                          {row.old_value || "—"}
                        </span>
                        {" → "}
                        {row.new_value || "—"}
                      </p>
                      <p className="text-xs text-text-muted">
                        {formatWhen(row.created_at)}
                        {row.actor_name ? ` · ${row.actor_name}` : ""}
                      </p>
                    </motion.li>
                  ))}
                </motion.ul>
              </AnimatePresence>
            ) : (
              <EmptyState>
                <EmptyCopy {...EMPTY_COPY_PRESETS.nothingHere} />
              </EmptyState>
            )}
          </div>
        </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
