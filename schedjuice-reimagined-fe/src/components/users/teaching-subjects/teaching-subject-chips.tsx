"use client";

import { Skeleton } from "@/components/primitives";
import { fetchUserTeachingSubjects } from "@/helpers/user-teaching-subjects";
import { teachingSubjectRowLabel } from "@/types/user-teaching-subject";
import { useQuery } from "@tanstack/react-query";

type TeachingSubjectChipsProps = {
  userId: number;
  enabled: boolean;
};

export function TeachingSubjectChips({ userId, enabled }: TeachingSubjectChipsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["user-teaching-subjects", userId],
    queryFn: () => fetchUserTeachingSubjects(userId),
    enabled,
  });

  if (!enabled) return null;

  if (isLoading) {
    return (
      <div
        className="flex flex-wrap justify-center gap-1.5 sm:justify-start"
        aria-busy="true"
        aria-label="Loading teaching subjects"
      >
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
    );
  }

  const rows = data ?? [];
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
      {rows.map((row) => (
        <span
          key={row.id}
          className="rounded-full bg-brand/15 px-2.5 py-0.5 text-xs font-medium text-accent"
        >
          {teachingSubjectRowLabel(row)}
        </span>
      ))}
    </div>
  );
}
