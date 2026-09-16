"use client";

import { useEffect, useMemo, useState } from "react";

import type { UserMatchCandidate } from "@/app/client-api/imports";
import type { CourseRosterStudent } from "@/lib/mark-sheets-api";

import {
  ScoredCommandPicker,
  type ScoredPickerItem,
} from "./scored-command-picker";

function filterRosterStudents(
  rosterStudents: CourseRosterStudent[],
  query: string,
): CourseRosterStudent[] {
  const q = query.trim().toLowerCase();
  if (!q) return rosterStudents;
  return rosterStudents.filter((student) => {
    const haystack = [student.name, student.email, student.code ?? ""]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

function candidatesToSuggestions(candidates: UserMatchCandidate[]): ScoredPickerItem[] {
  return candidates.map((c) => ({
    id: c.user.id,
    title: c.user.name,
    subtitle: c.user.email,
    score: c.score,
    scoreLabel: `${c.field} ≈ ${Math.round(c.score)}`,
  }));
}

function rosterToSearchResults(students: CourseRosterStudent[]): ScoredPickerItem[] {
  return students.map((student) => ({
    id: student.id,
    title: student.name,
    subtitle: student.email,
    score: null,
  }));
}

type Props = {
  rawEmail: string;
  importedName?: string;
  candidates: UserMatchCandidate[];
  rosterStudents: CourseRosterStudent[];
  compact?: boolean;
  onPickStudent: (studentId: number) => void;
  className?: string;
};

export function RosterStudentPicker({
  rawEmail,
  importedName,
  candidates,
  rosterStudents,
  compact = true,
  onPickStudent,
  className,
}: Props) {
  const initialQuery = importedName?.trim() || rawEmail.trim() || "";
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const suggestions = useMemo(() => candidatesToSuggestions(candidates), [candidates]);

  const trimmedQuery = query.trim();
  const trimmedInitial = initialQuery.trim();
  const showCandidateSuggestions =
    suggestions.length > 0 &&
    (trimmedQuery.length < 2 || trimmedQuery === trimmedInitial);

  const pickerSuggestions = showCandidateSuggestions ? suggestions : [];
  const pickerSearchResults = showCandidateSuggestions
    ? []
    : rosterToSearchResults(filterRosterStudents(rosterStudents, query));

  const contextValue = importedName?.trim() || rawEmail.trim() || "this row";

  return (
    <ScoredCommandPicker
      className={className}
      compact={compact}
      contextLabel={
        <>
          Spreadsheet value: <b>“{contextValue}”</b>
        </>
      }
      query={query}
      placeholder="Search roster…"
      suggestions={pickerSuggestions}
      searchResults={pickerSearchResults}
      emptyText="No students found."
      onQueryChange={setQuery}
      onSelect={onPickStudent}
    />
  );
}
