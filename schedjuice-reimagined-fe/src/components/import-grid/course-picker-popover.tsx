"use client";

import { useState } from "react";

import type { CourseCandidate } from "@/app/client-api/imports";
import { useCourseSearch } from "@/hooks/course-search/use-course-search";
import useImportStore from "@/store/import-store";

import {
  AnchoredImportPopover,
  type MatchAnchorRect,
} from "./user-match/anchored-import-popover";
import { ScoredCommandPicker } from "./user-match/scored-command-picker";

export type CoursePickerTarget = {
  rowId: string;
  tokenRaw: string;
  rect: MatchAnchorRect;
  candidates: CourseCandidate[];
  affectedRows: number;
};

export function CoursePickerPopover({
  target,
  onPick,
  onClose,
}: {
  target: CoursePickerTarget | null;
  onPick: (
    tokenRaw: string,
    rowId: string,
    choice: { id: number; title: string } | null,
  ) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState(target?.tokenRaw ?? "");
  const courseScope = useImportStore((s) => s.courseScope);
  const search = useCourseSearch(q, 1, courseScope);

  if (!target) return null;

  const refined = search.data?.results ?? [];
  const candidateItems = target.candidates.map((c) => ({
    id: c.id,
    title: c.title,
    subtitle: c.code ?? undefined,
    score: c.score,
  }));
  const remoteItems = refined.map((c) => ({
    id: c.id,
    title: c.title,
    subtitle: c.code ?? undefined,
    score: null,
  }));
  const useRemoteSearch = q.trim().length >= 2 && remoteItems.length > 0;
  const suggestions = useRemoteSearch ? [] : candidateItems;
  const searchResults = useRemoteSearch ? remoteItems : candidateItems;

  return (
    <AnchoredImportPopover
      variant="radix"
      rect={target.rect}
      open
      onClose={onClose}
      popupClassName="click-outside-ignore z-dropdown w-[340px] p-0"
    >
      <ScoredCommandPicker
        contextLabel={
          <>
            Spreadsheet value: <b>“{target.tokenRaw}”</b>
          </>
        }
        contextDetail={
          target.affectedRows > 1 ? ` · will link ${target.affectedRows} rows` : undefined
        }
        query={q}
        placeholder="Search courses…"
        suggestions={suggestions}
        searchResults={searchResults}
        isSearching={search.isFetching}
        emptyText="No matches."
        onQueryChange={setQ}
        onSelect={(id) => {
          const picked =
            refined.find((course) => course.id === id) ??
            target.candidates.find((course) => course.id === id);
          if (!picked) return;
          onPick(target.tokenRaw, target.rowId, { id: picked.id, title: picked.title });
        }}
        footer={
          <button
            type="button"
            className="w-full border-t px-3 py-2 text-left text-xs text-amber-800 hover:bg-muted/50 dark:text-amber-200"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(target.tokenRaw, target.rowId, null)}
          >
            Mark as “no course” ✕
          </button>
        }
      />
    </AnchoredImportPopover>
  );
}
