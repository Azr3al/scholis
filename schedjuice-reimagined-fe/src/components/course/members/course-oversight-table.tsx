"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "iconoir-react";
import {
  formatScopeReasons,
  getCourseScopeOverseers,
} from "@/app/client-api/course-oversight";
import { buttonVariants } from "@/components/primitives";
import { Skeleton } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { buildUserProfileHref } from "@/helpers/course/roster-table-utils";

export function CourseOversightTable({
  courseId,
  hideProfileLink,
}: {
  courseId: string | number;
  hideProfileLink?: boolean;
}) {
  const pathname = usePathname();
  const { data, isLoading } = useQuery({
    queryKey: ["courseScopeOverseers", courseId],
    queryFn: () => getCourseScopeOverseers(courseId),
  });

  if (isLoading) {
    return <Skeleton className="h-24 w-full rounded-md" />;
  }
  if (!data?.length) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Oversight
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">Name</th>
            <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">Email</th>
            <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">Scope</th>
            {!hideProfileLink ? <th className="h-10 w-10 px-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const href = hideProfileLink
              ? null
              : buildUserProfileHref(
                  row.user.id,
                  pathname,
                  typeof window !== "undefined" ? window.location.search : "",
                );
            const profileLabel = row.user.name?.trim()
              ? `Open profile for ${row.user.name.trim()}`
              : "Open profile";
            return (
              <tr key={row.user.id} className="border-b border-border">
                <td className="p-2 align-middle font-medium">{row.user.name}</td>
                <td className="p-2 align-middle text-muted-foreground">
                  {row.user.email}
                </td>
                <td className="p-2 align-middle">{formatScopeReasons(row.scope_reasons)}</td>
                {!hideProfileLink && href ? (
                  <td className="p-2 align-middle text-muted-foreground">
                    <Link
                      href={href}
                      aria-label={profileLabel}
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        "shrink-0",
                      )}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
