"use client";

import { Avatar } from "@/components/primitives";

import type { TeacherCandidate } from "./types";

export type AssignmentTeacherContextProps = {
  teacher: TeacherCandidate;
  roleName?: string | null;
};

export function AssignmentTeacherContext({
  teacher,
  roleName,
}: AssignmentTeacherContextProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
      <Avatar
        src={teacher.profile_image || "/images/default.jpg"}
        name={teacher.name || teacher.email || "Teacher"}
        className="h-9 w-9 shrink-0"
        loading="lazy"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text-primary">{teacher.name}</p>
        <p className="truncate text-xs text-text-muted">{teacher.email}</p>
        {roleName ? (
          <p className="mt-0.5 truncate text-xs text-text-secondary">{roleName}</p>
        ) : null}
      </div>
    </div>
  );
}
