"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebouncedCallback } from "use-debounce";
import type { BoardMentionCandidate } from "@/lib/board-mentions";

/** Debounced server search for board mention-candidate endpoints (`?q=`). */
export function useBoardMentionCandidateSearch(
  queryKeyBase: readonly unknown[],
  fetchCandidates: (q: string) => Promise<BoardMentionCandidate[]>,
) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounced = useDebouncedCallback((value: string) => {
    setDebouncedSearch(value.trim());
  }, 300);

  useEffect(() => {
    debounced(search);
    return () => debounced.cancel();
  }, [debounced, search]);

  const query = useQuery({
    queryKey: [...queryKeyBase, debouncedSearch],
    queryFn: () => fetchCandidates(debouncedSearch),
    staleTime: 10_000,
  });

  return {
    setSearch,
    debouncedSearch,
    candidates: query.data ?? [],
    isFetching: query.isFetching,
  };
}
