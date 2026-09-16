"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { NavArrowRight as ChevronRight } from "iconoir-react";
import { cn } from "@/lib/utils";

export type CourseInfoItem = {
  label: string;
  text: string | number;
};

type CourseInfoCardProps = {
  icon: ReactNode;
  info: CourseInfoItem;
  href?: string;
  ariaLabel?: string;
};

export default function CourseInfoCard({
  icon,
  info,
  href,
  ariaLabel,
}: CourseInfoCardProps) {
  const body = (
    <>
      <div className="rounded-lg bg-muted/80 p-2 text-muted-foreground">{icon}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
        <p className="text-muted-foreground">{info.label}</p>
        <p className="tabular-nums font-medium text-foreground">{info.text}</p>
      </div>
      {href ? (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
    </>
  );

  const className = cn(
    "flex min-w-[7.5rem] shrink-0 items-center gap-3 rounded-xl border border-border/60 bg-muted/40 p-4 text-left transition-colors",
    href && "cursor-pointer hover:bg-muted/60",
    !href && "cursor-default",
  );

  if (href) {
    return (
      <Link href={href} className={className} aria-label={ariaLabel}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}
