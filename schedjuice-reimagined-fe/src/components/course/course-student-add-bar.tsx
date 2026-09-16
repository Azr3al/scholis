"use client";

import * as React from "react";
import type { UseMutationResult } from "@tanstack/react-query";

import { makePostRequest } from "@/app/client-api/utils";
import EntityCombobox, {
  type EntityComboboxOption,
} from "@/components/form/entity-combobox";
import { FormSaveTick } from "@/components/product-docs/form-save-tick";

const TICK_MS = 2000;

type CourseStudentAddBarProps = {
  courseId: number;
  addStudent: UseMutationResult<void, unknown, number, unknown>;
  disabled?: boolean;
  tickLabel?: string;
};

export function CourseStudentAddBar({
  courseId,
  addStudent,
  disabled = false,
  tickLabel = "Added",
}: CourseStudentAddBarProps) {
  const [showTick, setShowTick] = React.useState(false);
  const tickTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const flashTick = React.useCallback(() => {
    if (tickTimerRef.current) {
      clearTimeout(tickTimerRef.current);
    }
    setShowTick(true);
    tickTimerRef.current = setTimeout(() => setShowTick(false), TICK_MS);
  }, []);

  React.useEffect(() => {
    return () => {
      if (tickTimerRef.current) {
        clearTimeout(tickTimerRef.current);
      }
    };
  }, []);

  const fetchCandidateOptions = React.useCallback(
    async (searchValue: string): Promise<EntityComboboxOption[]> => {
      const response = await makePostRequest(
        `courses/${courseId}/student-candidates/search`,
        { query: searchValue, limit: 10 },
        { size: 10 },
      );
      const candidates: Array<{
        id: number;
        name: string;
        email: string;
        code?: string | null;
      }> = response.data.data;
      return candidates.map((candidate) => {
        const userIdPart = candidate.code ? ` (${candidate.code})` : "";
        return {
          value: String(candidate.id),
          label: `${candidate.name} - ${candidate.email}${userIdPart}`,
        };
      });
    },
    [courseId],
  );

  const handleSelect = (userId: string) => {
    const parsed = Number(userId);
    if (!userId || !Number.isFinite(parsed)) {
      return;
    }
    addStudent.mutate(parsed, {
      onSuccess: () => {
        flashTick();
      },
    });
  };

  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-3">
      <EntityCombobox
        label=""
        hideLabel
        comboboxPlaceholder="Search by name or email to add a student…"
        variant="search"
        value=""
        onChange={handleSelect}
        fetchOptions={fetchCandidateOptions}
        initialSearchValue=""
        debounceMilliseconds={250}
        disabled={disabled}
        isSaving={addStudent.isPending}
        widthClassName="w-full min-w-0"
      />
      <FormSaveTick visible={showTick} label={tickLabel} />
    </div>
  );
}
