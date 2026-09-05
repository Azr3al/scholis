"use client";

import { useMemo } from "react";
import { Xmark } from "iconoir-react";
import { Avatar } from "@/components/primitives";
import { EntityComboboxList } from "@/components/form/entity-combobox-list";
import { useBoardMentionCandidateSearch } from "@/hooks/use-board-mention-candidate-search";
import { cn } from "@/lib/utils";
import type { BoardMentionCandidate } from "@/lib/board-mentions";

type BoardObserver = { id: number; name: string; email: string };

/**
 * Shared board-detail observers panel: chips + remove, plus an "add observer"
 * combobox scoped to users who already have the board's view permission.
 * Reused by Leads and Issues detail drawers.
 */
export function ObserversList({
  observers,
  fetchCandidates,
  candidateQueryKeyPrefix,
  onAdd,
  onRemove,
  isAdding = false,
  removingUserId = null,
  className,
}: {
  observers: BoardObserver[];
  fetchCandidates: (q: string) => Promise<BoardMentionCandidate[]>;
  candidateQueryKeyPrefix: readonly unknown[];
  onAdd: (userId: number) => void;
  onRemove: (userId: number) => void;
  isAdding?: boolean;
  removingUserId?: number | null;
  className?: string;
}) {
  const { setSearch, candidates, isFetching } = useBoardMentionCandidateSearch(
    candidateQueryKeyPrefix,
    fetchCandidates,
  );

  const observerIds = useMemo(
    () => new Set(observers.map((observer) => observer.id)),
    [observers],
  );

  const addableOptions = useMemo(
    () =>
      candidates
        .filter((candidate) => !observerIds.has(candidate.id))
        .map((candidate) => ({
          value: String(candidate.id),
          label: candidate.name || candidate.email,
        })),
    [candidates, observerIds],
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-1.5">
        {observers.length === 0 ? (
          <p className="text-xs text-text-muted">No observers yet.</p>
        ) : (
          observers.map((observer) => {
            const label = observer.name || observer.email || "Unknown";
            const isRemoving = removingUserId === observer.id;
            return (
              <span
                key={observer.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-1 text-xs text-text-primary"
              >
                <Avatar src={undefined} name={label} className="size-5 text-[10px]" />
                <span className="max-w-40 truncate">{label}</span>
                <button
                  type="button"
                  aria-label={`Remove ${label} as an observer`}
                  disabled={isRemoving}
                  className="rounded-full p-0.5 text-text-muted hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
                  onClick={() => onRemove(observer.id)}
                >
                  <Xmark className="size-3" aria-hidden />
                </button>
              </span>
            );
          })
        )}
      </div>
      <EntityComboboxList
        label="observer"
        placeholder="Add observer"
        value=""
        onChange={(value) => {
          if (!value) return;
          onAdd(Number(value));
        }}
        options={addableOptions}
        isLoading={isFetching}
        isSaving={isAdding}
        allowDeselect={false}
        serverSideFilter
        onFilterChange={setSearch}
        triggerClassName="h-8 text-xs"
      />
    </div>
  );
}
