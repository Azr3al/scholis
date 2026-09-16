"use client";

import { QuizStatusBadge } from "@/components/quiz-v3/shared/quiz-status-badge";
import { PrimaryTeacherLine } from "@/components/course/primary-teacher-line";
import { RandomPatternImage } from "@/components/course/random-pattern-image";
import { formatDateTime } from "@/helpers/date";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { QuizStatus, type QuizTypeV3 } from "@/types/quiz-v3";
import { Row } from "@tanstack/react-table";
import { usePathname, useRouter } from "next/navigation";

type QuizListRow = Pick<
  QuizTypeV3,
  "id" | "title" | "status" | "created_at"
> & {
  category?: { name?: string | null; title?: string | null } | null;
  created_by?:
    | { id?: number; name?: string; email?: string | null }
    | number
    | null;
};

export function QuizCard({
  quizRow,
  baseDetailsPath,
}: {
  quizRow: Row<QuizListRow>;
  baseDetailsPath: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const original = quizRow.original;
  const categoryTitle =
    original.category?.name?.trim() ||
    original.category?.title?.trim() ||
    null;
  const createdBy =
    typeof original.created_by === "object" && original.created_by !== null
      ? original.created_by
      : null;

  const quizPk = original.id;
  const patternSeed =
    typeof quizPk === "number" && Number.isFinite(quizPk)
      ? quizPk
      : Math.abs(
          String(original.title ?? "")
            .split("")
            .reduce((a, c) => a + c.charCodeAt(0), 0),
        );

  return (
    <div
      onClick={() => {
        if (!isValidApiEntityIdParam(String(original.id ?? ""))) return;
        router.push(`${baseDetailsPath}/${original.id}?ref=${pathname}`);
      }}
      className="cursor-pointer overflow-hidden rounded-xl border border-border bg-surface pt-0 text-text-primary shadow-xs transition-shadow duration-200 ease-in-out hover:shadow-md"
    >
      <div className="relative w-full min-w-0 overflow-hidden rounded-t-xl">
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-t from-black/45 via-black/15 to-transparent" />
        <RandomPatternImage seed={patternSeed} />
        <div className="flex flex-col gap-1.5 p-6 absolute bottom-0 z-10 w-full flex flex-col gap-1 px-4 py-3 sm:px-6">
          {categoryTitle ? (
            <p className="text-sm text-text-secondary line-clamp-1 text-xs text-white">
              {categoryTitle}
            </p>
          ) : null}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-serif text-xl leading-none tracking-tight line-clamp-2 max-w-[min(100%,16rem)] text-base font-semibold leading-snug text-white">
              {original.title}
            </h3>
          </div>
        </div>
        <div className="absolute right-2 top-2 z-10">
          <QuizStatusBadge status={original.status as QuizStatus} />
        </div>
      </div>
      <div className="p-6 pt-0 space-y-2 px-4 py-3 text-sm text-text-muted">
        {original.created_at ? (
          <p className="text-xs">
            Created {formatDateTime(original.created_at)}
          </p>
        ) : null}
        {createdBy?.name ? (
          <PrimaryTeacherLine
            teacher={{
              id: createdBy.id ?? 0,
              name: createdBy.name,
              email: createdBy.email ?? "",
            }}
            className="text-xs"
          />
        ) : null}
      </div>
    </div>
  );
}
