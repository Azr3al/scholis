"use client";
import { Skeleton } from "@/components/primitives";

import { contentRouteBodyClassName } from "@/lib/ui-remediation/r10-content-route-classes";
import { quizV3TakeShellThemeClass } from "@/lib/quiz-v3-theme-presets";
import { cn } from "@/lib/utils";
import { QuizThemeV3 } from "@/types/quiz-v3";
import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Short label on the right side of the header (e.g. “Quiz”, “Results”). */
  contextLabel?: string;
  className?: string;
  /** Learner branding theme (backdrop wash). */
  theme?: QuizThemeV3;
  /** Optional school logo URL from the tenant organization. */
  logoUrl?: string | null;
  /** Shown next to the logo for accessibility when logo is present. */
  organizationName?: string | null;
  /**
   * While learner branding is still loading, omit default product marks and names
   * (neutral header placeholders only).
   */
  isBrandingLoading?: boolean;
};

/**
 * Shared chrome for public quiz take / result routes and optional tenant branding.
 */
export function QuizTakeShell({
  children,
  contextLabel,
  className,
  theme = QuizThemeV3.Slate,
  logoUrl,
  organizationName,
  isBrandingLoading = false,
}: Props) {
  const themeClass = quizV3TakeShellThemeClass(theme);
  return (
    <div className={cn("min-h-screen text-text-primary", themeClass, className)}>
      <header className="border-border/70 bg-surface/90 sticky top-0 z-10 border-b shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {isBrandingLoading ? (
              <div
                className="flex items-center gap-3"
                aria-busy="true"
                aria-label="Loading"
              >
                <Skeleton className="size-8 shrink-0 rounded-lg" />
                <Skeleton className="h-5 w-28 max-w-[10rem] shrink-0 rounded-md sm:w-36" />
              </div>
            ) : logoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt={
                    organizationName
                      ? `${organizationName} logo`
                      : "Organization logo"
                  }
                  className="h-9 w-auto max-w-[160px] shrink-0 object-contain"
                />
                {organizationName ? (
                  <span className="truncate text-base font-semibold tracking-tight">
                    {organizationName}
                  </span>
                ) : null}
              </>
            ) : organizationName ? (
              <span className="truncate text-base font-semibold tracking-tight">
                {organizationName}
              </span>
            ) : (
              <Link
                href="https://schedjuice.com"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-w-0 items-center gap-2.5"
              >
                <span
                  className="bg-accent flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-accent-foreground shadow-sm transition-transform group-hover:scale-[1.02]"
                  aria-hidden
                >
                  S
                </span>
                <span className="text-base font-semibold tracking-tight">
                  Schedjuice
                </span>
              </Link>
            )}
          </div>
          {contextLabel ? (
            <span className="text-text-muted hidden text-sm font-medium sm:inline">
              {contextLabel}
            </span>
          ) : null}
        </div>
      </header>
      <div
        className={cn(
          contentRouteBodyClassName("take-flow"),
          "sm:px-6 sm:py-10",
        )}
      >
        <div className="bg-surface border-border/60 shadow-md rounded-2xl border px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </div>
      </div>
    </div>
  );
}
