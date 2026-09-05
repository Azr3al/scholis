"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useDebouncedCallback } from "use-debounce";

import { SearchField } from "@/components/form/search-field";
import { Avatar, Skeleton } from "@/components/primitives";
import { canAssignTeacherToEvents } from "@/helpers/authorization";
import { useTeacherCandidates } from "@/hooks/course/use-teacher-candidates";
import { useUser } from "@/hooks/useUser";
import { crossfadeInstant, crossfadeOpacity } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";

import type { TeacherCandidate } from "./types";

export type TeacherSearchListProps = {
  courseId: string | number;
  excludeUserIds: number[];
  selectedTeacherId: number | null;
  onSelectTeacher: (teacher: TeacherCandidate) => void;
  assignedAsRoleId?: number | null;
  skipBusyIndicator?: boolean;
};

export function TeacherSearchList({
  courseId,
  excludeUserIds,
  selectedTeacherId,
  onSelectTeacher,
  assignedAsRoleId = null,
  skipBusyIndicator = false,
}: TeacherSearchListProps) {
  const { user } = useUser();
  const reduced = useReducedMotion();
  const resultVariants = reduced ? crossfadeInstant : crossfadeOpacity;
  const [search, setSearch] = useState("");
  const setSearchDebounced = useDebouncedCallback(setSearch, 150);
  const { candidates, isLoading, isRefetching } = useTeacherCandidates({
    courseId,
    search,
    excludeUserIds,
    assignedAsRoleId,
  });

  const resultsKey = isLoading ? "loading" : search.trim() || "all";

  return (
    <div className="space-y-3">
      <SearchField
        placeholder="Search name, email or alternative name"
        defaultValue={search}
        onChange={(e) => setSearchDebounced(e.target.value)}
        isFetching={isRefetching}
      />
      <div
        className={cn(
          "max-h-[min(320px,45vh)] min-h-[160px] overflow-y-auto rounded-lg border border-border p-1",
          isRefetching && "opacity-50",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={resultsKey}
            variants={resultVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="space-y-1"
            aria-busy={isLoading || undefined}
          >
            {isLoading ? (
              <div className="space-y-2 p-1" aria-label="Loading teachers">
                <Skeleton className="h-[52px] w-full" />
                <Skeleton className="h-[52px] w-full" />
                <Skeleton className="h-[52px] w-2/3" />
              </div>
            ) : null}
            {!isLoading && candidates.length === 0 ? (
              <p className="p-4 text-sm text-text-secondary">
                {search
                  ? `No teachers match "${search}".`
                  : "No teachers are available for this course."}
              </p>
            ) : null}
            {!isLoading
              ? candidates.map((teacher) => {
                  const canAssign =
                    user != null &&
                    canAssignTeacherToEvents(user, Number(teacher.id));
                  const selected = Number(teacher.id) === selectedTeacherId;
                  return (
                    <button
                      key={teacher.id}
                      type="button"
                      disabled={!canAssign}
                      aria-pressed={selected}
                      onClick={() => onSelectTeacher(teacher)}
                      className={cn(
                        "flex min-h-[52px] w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                        selected
                          ? "border-[var(--action,var(--data-green-strong))] bg-accent"
                          : "border-border bg-surface hover:bg-accent/40",
                        !canAssign && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Avatar
                        src={teacher.profile_image || "/images/default.jpg"}
                        name={teacher.name || teacher.email || "Teacher"}
                        className="h-8 w-8"
                        loading="lazy"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-text-primary">
                          {teacher.name}
                        </span>
                        <span className="block truncate text-xs text-text-muted">
                          {teacher.email}
                        </span>
                      </span>
                      {teacher.isFree === false && !skipBusyIndicator ? (
                        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
                          {teacher.busyReason === "substitution_reserve"
                            ? "Substitution reserve"
                            : "Busy"}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
