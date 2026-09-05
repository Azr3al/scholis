"use client";
import { Button, buttonVariants } from "@/components/primitives";

import type { ReactNode } from "react";
import { formatDateTime } from "@/helpers/date";
import type { courseType } from "@/types/course";
import { cn } from "@/lib/utils";
import { Copy } from "iconoir-react";
import Link from "next/link";

type MeetingLinkCourseCardProps = {
  course: courseType;
  onCopy: (label: string, text: string) => void;
};

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1 min-w-0">
      <div className="text-xs font-medium text-text-muted">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function MeetingLinkCourseCard({
  course,
  onCopy,
}: MeetingLinkCourseCardProps) {
  const link = course.meeting_link ? String(course.meeting_link) : "";
  const joinId = course.meeting_join_id
    ? String(course.meeting_join_id)
    : null;
  const passcode = course.meeting_passcode
    ? String(course.meeting_passcode)
    : null;
  const linkSetAt = course.meeting_scheduled_at
    ? String(course.meeting_scheduled_at)
    : null;

  return (
    <div className="gap-0 py-0 shadow-sm">
      <div className="px-3 pt-3 pb-0 sm:px-4">
        <h3 className="text-sm font-semibold leading-snug line-clamp-3 sm:text-base">
          {course.title}
        </h3>
      </div>
      <div className="space-y-3 px-3 pb-3 pt-2 sm:px-4">
        <FieldRow label="Join">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={link || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({
                  variant: "secondary",
                  size: "sm",
                }),
              )}
            >
              Open link
            </Link>
            <Button
              type="button"
              variant="secondary" size="sm" className="h-8 w-8 shrink-0"
              onClick={() => onCopy("link", link)}
              aria-label="Copy meeting link"
            >
              <Copy className="size-4" />
            </Button>
          </div>
        </FieldRow>

        {linkSetAt && (
          <FieldRow label="Link set">
            <span className="text-sm text-text-muted">
              {formatDateTime(linkSetAt)}
            </span>
          </FieldRow>
        )}

        <FieldRow label="Meeting ID">
          <div className="flex items-start gap-2 min-w-0">
            <span className="font-mono text-sm break-all text-text-primary">
              {joinId ?? "—"}
            </span>
            {joinId && (
              <Button
                type="button"
                variant="ghost"
                size="sm" className="h-8 w-8 shrink-0"
                onClick={() => onCopy("meeting ID", joinId)}
                aria-label="Copy meeting ID"
              >
                <Copy className="size-4" />
              </Button>
            )}
          </div>
        </FieldRow>

        <FieldRow label="Passcode">
          <div className="flex items-start gap-2 min-w-0">
            <span className="font-mono text-sm break-all text-text-primary">
              {passcode ?? "—"}
            </span>
            {passcode && (
              <Button
                type="button"
                variant="ghost"
                size="sm" className="h-8 w-8 shrink-0"
                onClick={() => onCopy("passcode", passcode)}
                aria-label="Copy passcode"
              >
                <Copy className="size-4" />
              </Button>
            )}
          </div>
        </FieldRow>
      </div>
    </div>
  );
}
