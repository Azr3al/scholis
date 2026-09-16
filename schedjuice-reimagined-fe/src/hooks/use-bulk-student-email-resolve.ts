"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { searchEntities } from "@/app/client-api/utils";
import {
  classifyBulkStudentRows,
  normalizeEmail,
  summarizeBulkStudentRows,
  type BulkStudentSearchHit,
} from "@/lib/course/bulk-student-email-resolve";
import { parseStudentEmailPaste } from "@/lib/course/parse-student-email-paste";
import { listToApiArray } from "@/helpers/filter-params";
import { operatorEnum } from "@/types/api";

const RESOLVE_DEBOUNCE_MS = 300;

export function useBulkStudentEmailResolve({
  pastedText,
  rosterEmails,
  requiresMsLink,
  enabled = true,
}: {
  pastedText: string;
  rosterEmails: Set<string>;
  requiresMsLink: boolean;
  enabled?: boolean;
}) {
  const parsedEmails = useMemo(
    () => parseStudentEmailPaste(pastedText),
    [pastedText],
  );

  const [debouncedEmails, setDebouncedEmails] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(
      () => setDebouncedEmails(parsedEmails),
      RESOLVE_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [parsedEmails, enabled]);

  const searchQuery = useQuery({
    queryKey: ["bulkStudentEmailResolve", debouncedEmails.join("|")],
    enabled: enabled && debouncedEmails.length > 0,
    queryFn: async () => {
      const response = await searchEntities(
        "users",
        { size: -1, sorts: ["email"] },
        {
          filter_params: [
            {
              field_name: "email",
              operator: operatorEnum.in,
              value: debouncedEmails.toString(),
            },
            {
              field_name: "roles",
              operator: operatorEnum.contained_by,
              value: listToApiArray(["student"]),
            },
          ],
        },
      );
      return response.data.data as BulkStudentSearchHit[];
    },
  });

  const [linkedOverrides, setLinkedOverrides] = useState<
    Record<number, string>
  >({});

  const hitsByEmail = useMemo(() => {
    const map = new Map<string, BulkStudentSearchHit>();
    for (const hit of searchQuery.data ?? []) {
      const msId = linkedOverrides[hit.id] ?? hit.microsoft_id;
      map.set(normalizeEmail(hit.email), { ...hit, microsoft_id: msId });
    }
    return map;
  }, [searchQuery.data, linkedOverrides]);

  const rows = useMemo(
    () =>
      classifyBulkStudentRows({
        emails: parsedEmails,
        hitsByEmail,
        rosterEmails,
        requiresMsLink,
      }),
    [parsedEmails, hitsByEmail, rosterEmails, requiresMsLink],
  );

  const summary = useMemo(() => summarizeBulkStudentRows(rows), [rows]);

  const markMicrosoftLinked = useCallback((userId: number, microsoftId: string) => {
    setLinkedOverrides((prev) => ({ ...prev, [userId]: microsoftId }));
  }, []);

  return {
    parsedEmails,
    rows,
    summary,
    isSearching: searchQuery.isFetching,
    searchError: searchQuery.error,
    markMicrosoftLinked,
  };
}
