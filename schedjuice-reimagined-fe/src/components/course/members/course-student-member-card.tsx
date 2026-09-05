"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "iconoir-react";

import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";

export interface CourseStudentMemberCardProps {
  row: Record<string, unknown>;
  baseDetailsPath: string;
  hideProfileLink?: boolean;
  getId?: (row: Record<string, unknown>) => string | number | undefined;
}

export function CourseStudentMemberCard({
  row,
  baseDetailsPath,
  hideProfileLink,
  getId,
}: CourseStudentMemberCardProps) {
  const pathname = usePathname();
  const name =
    typeof row.name === "string" && row.name.trim()
      ? row.name.trim()
      : "—";
  const id = getId ? getId(row) : (row.id as string | number | undefined);
  const email =
    typeof row.email === "string" && row.email.trim()
      ? row.email.trim()
      : null;
  const alt =
    typeof row.alternative_name === "string" && row.alternative_name.trim()
      ? row.alternative_name.trim()
      : null;

  const profileHref =
    id != null && id !== ""
      ? `${baseDetailsPath}/${id}?ref=${encodeURIComponent(
          `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`,
        )}`
      : null;

  return (
    <div className="rounded-lg border border-border bg-card gap-0 py-4 transition-colors">
      <div className="gap-0 space-y-0 px-4 pb-1.5 pt-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold tracking-tight">
            {name}
          </h3>
          {!hideProfileLink && profileHref && (
            <Link
              href={profileHref}
              aria-label={`Open profile for ${name}`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "shrink-0"
              )}
            >
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
      {(email || alt) && (
        <div className="flex flex-col gap-1 px-4 pb-0 pt-0">
          {email ? (
            <p className="text-sm text-muted-foreground break-words">
              {email}
            </p>
          ) : null}
          {alt ? (
            <p className="text-sm text-muted-foreground break-words">
              {alt}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
