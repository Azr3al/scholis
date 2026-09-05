"use client";

import Link from "next/link";
import Image from "next/image";
import React, { useEffect, useState } from "react";
import {
  discriminateMeetingLink,
  isTeamsMeeting,
  isZoomMeeting,
} from "@/helpers/discriminate-meeting-link";
import { Button, buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { updateEntity } from "@/app/client-api/utils";
import { courseType } from "@/types/course";
import { useToast } from "@/components/primitives";

import {
  Popover,
} from "@/components/primitives";

import {
  Sheet,
} from "@/components/primitives";

import {
  Tooltip,
} from "@/components/primitives";

import { Copy, Check } from "iconoir-react";
import { canCreateCourse } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import { useTenant } from "@/hooks/useTenant";
import { formatDateTime } from "@/helpers/date";

type MeetingLinkProps = {
  toRedirectMeetingLink: string;
  courseId: string;
  meetingJoinId?: string | null;
  meetingPasscode?: string | null;
  variant?: "default" | "compact";
  /** When set (compact variant), shown under the action row, left-aligned with the buttons. */
  meetingScheduledAt?: string | null;
  /** Copyable Zoom meeting ID (number or UUID from Reports API). */
  zoomMeetingId?: string | null;
  /** When true, do not offer editing meeting_link (e.g. URL derived from zoom_meeting_id only). */
  meetingLinkReadOnly?: boolean;
  /**
   * URL for join / external links. Omit to use toRedirectMeetingLink.
   * Pass null when there is no safe join URL (e.g. only a Zoom UUID is stored).
   */
  joinTargetUrl?: string | null;
};

const MeetingLink = ({
  toRedirectMeetingLink,
  courseId,
  meetingJoinId,
  meetingPasscode,
  variant = "default",
  meetingScheduledAt,
  zoomMeetingId,
  meetingLinkReadOnly = false,
  joinTargetUrl,
}: MeetingLinkProps) => {
  const toast = useToast();
  const { user } = useUser();
  const { tenant } = useTenant();
  const [isMeetingLinkEdit, setIsMeetingLinkEdit] = useState<boolean>(false);
  const [meetingDetailsOpen, setMeetingDetailsOpen] = useState(false);
  const [meetingLink, setMeetingLink] = useState<string>(toRedirectMeetingLink);
  const [lastCopied, setLastCopied] = useState<string | null>(null);

  useEffect(() => {
    setMeetingLink(toRedirectMeetingLink);
  }, [toRedirectMeetingLink]);

  const { mutate: updateMeetingLink, isPending } = useMutation({
    mutationKey: ["updateMeetingLink", courseId],
    mutationFn: (data: Pick<courseType, "meeting_link">) => {
      return updateEntity("courses", courseId, data);
    },
    onSuccess: () => {
      setIsMeetingLinkEdit(false);
      toast.add({ title: "Meeting link updated" });
    },
  });

  const handleMeetingLinkUpdate = () => {
    updateMeetingLink({
      meeting_link: meetingLink,
    });
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setLastCopied(text);
      toast.add({ title: "Copied!", description: `${label} copied to clipboard.` });
    } catch {
      toast.add({
        title: "Failed to copy",
        description: `Could not copy ${label}.`,
      });
    }
  };

  const resolvedJoinHref =
    joinTargetUrl === undefined ? toRedirectMeetingLink : joinTargetUrl;
  const canNavigateToMeeting =
    typeof resolvedJoinHref === "string" && resolvedJoinHref.length > 0;

  const showTeamsDetails =
    isTeamsMeeting(meetingLink) && (meetingJoinId || meetingPasscode);
  const zoomIdTrimmed = (zoomMeetingId || "").trim();
  const showZoomMeetingIdRow =
    Boolean(zoomIdTrimmed) &&
    (isZoomMeeting(meetingLink) || meetingLinkReadOnly || !isTeamsMeeting(meetingLink));

  useEffect(() => {
    if (lastCopied) {
      const t = setTimeout(() => setLastCopied(null), 2000);
      return () => clearTimeout(t);
    }
  }, [lastCopied]);

  const CopyButton = ({
    text,
    label,
    size = 16,
    className,
  }: {
    text: string;
    label: string;
    size?: number;
    className?: string;
  }) => (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={<button
          type="button"
          onClick={() => handleCopy(text, label)}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
          aria-label={`Copy ${label}`}
        />}
      >
          {lastCopied === text ? (
            <Check width={size} height={size} className="text-success" />
          ) : (
            <Copy width={size} height={size} />
          )}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner>
          <Tooltip.Popup>
            <p>Copy {label}</p>
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );

  const MeetingIconTooltip = ({
    size,
    tooltip,
    ariaLabel,
    className,
  }: {
    size: number;
    tooltip: string;
    ariaLabel?: string;
    className: string;
  }) => (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          canNavigateToMeeting ? (
            <Link
              href={resolvedJoinHref ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={ariaLabel}
              className={className}
            >
              <Image
                src={discriminateMeetingLink(meetingLink)}
                alt=""
                width={size}
                height={size}
                className="rounded-md"
              />
            </Link>
          ) : (
            <span className={className}>
              <Image
                src={discriminateMeetingLink(meetingLink)}
                alt=""
                width={size}
                height={size}
                className="rounded-md"
              />
            </span>
          )
        }
      />
      <Tooltip.Portal>
        <Tooltip.Positioner>
          <Tooltip.Popup>
            <p>{tooltip}</p>
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );

  const TeamsDetailRow = ({
    label,
    value,
  }: {
    label: string;
    value: string;
  }) => (
    <div className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
      <span className="shrink-0 whitespace-nowrap text-xs font-medium leading-none text-muted-foreground">
        {label}
      </span>
      <code className="flex min-h-8 min-w-0 items-center truncate rounded-md border border-border bg-muted/50 px-2.5 py-0 font-mono text-xs leading-none tabular-nums">
        {value}
      </code>
      <CopyButton
        text={value}
        label={label.toLowerCase()}
        size={14}
        className="size-8 shrink-0 p-0"
      />
    </div>
  );

  const TeamsDetails = () =>
    showTeamsDetails ? (
      <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-8 sm:gap-y-2">
        {meetingJoinId && (
          <div className="min-w-0 flex-1 basis-full sm:basis-[min(100%,20rem)]">
            <TeamsDetailRow label="Join ID" value={meetingJoinId} />
          </div>
        )}
        {meetingPasscode && (
          <div className="min-w-0 flex-1 basis-full sm:basis-[min(100%,20rem)]">
            <TeamsDetailRow label="Passcode" value={meetingPasscode} />
          </div>
        )}
      </div>
    ) : null;

  const ZoomMeetingIdDetails = () =>
    showZoomMeetingIdRow ? (
      <div className="w-full min-w-0 max-w-full">
        <TeamsDetailRow label="Meeting ID" value={zoomIdTrimmed} />
      </div>
    ) : null;

  const canEdit = Boolean(tenant && user && canCreateCourse(tenant, user));
  const canEditMeetingLink = canEdit && !meetingLinkReadOnly;

  const openEditFromSheet = () => {
    setMeetingDetailsOpen(false);
    queueMicrotask(() => setIsMeetingLinkEdit(true));
  };

  const meetingDetailsSheet = (
    <Sheet.Root open={meetingDetailsOpen} onOpenChange={setMeetingDetailsOpen}>
      <Sheet.Trigger
        render={<Button type="button" variant="secondary" size="sm" />}
      >
          Meeting details
      </Sheet.Trigger>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup side="right" className="flex w-full flex-col gap-4 sm:max-w-md">
        <div className="space-y-2 text-left">
          <div className="flex flex-wrap items-start justify-between gap-2 pr-6">
            <Sheet.Title className="text-left">Meeting details</Sheet.Title>
            {canEditMeetingLink ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 shrink-0"
                onClick={openEditFromSheet}
              >
                Edit
              </Button>
            ) : null}
          </div>
          <Sheet.Description>
            Join link and identifiers for this class.
          </Sheet.Description>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <Image
              src={discriminateMeetingLink(meetingLink)}
              alt=""
              width={28}
              height={28}
              className="mt-0.5 shrink-0 rounded-md"
            />
            <p
              className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-foreground"
              title={meetingLink}
            >
              {meetingLink}
            </p>
            <CopyButton text={meetingLink} label="meeting link" size={16} />
          </div>
          <TeamsDetails />
          <ZoomMeetingIdDetails />
        </div>
        </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );

  const editLinkPopover = canEditMeetingLink ? (
    <Popover.Root
      open={isMeetingLinkEdit}
      onOpenChange={(open) => {
        setIsMeetingLinkEdit(open);
        if (!open) {
          setMeetingLink(toRedirectMeetingLink);
        }
      }}
    >
      <Popover.Trigger
        render={
          <button
            type="button"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          />
        }
      >
        Edit
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="end">
          <Popover.Popup className="w-[min(100vw-2rem,22rem)]">
          <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">Edit meeting link</p>
          <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/30 px-2 py-2">
            <MeetingIconTooltip
              size={24}
              tooltip="Open meeting"
              className={cn(
                "shrink-0 rounded-md p-0.5",
                canNavigateToMeeting
                  ? "transition-colors hover:bg-accent/50"
                  : "opacity-80",
              )}
            />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none focus-visible:ring-0"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              aria-label="Meeting link URL"
            />
            <CopyButton text={meetingLink} label="meeting link" size={16} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsMeetingLinkEdit(false);
                setMeetingLink(toRedirectMeetingLink);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleMeetingLinkUpdate}
              isLoading={isPending}
            >
              Update
            </Button>
          </div>
          </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  ) : null;

  if (variant === "compact") {
    return (
      <div className="flex w-full min-w-0 max-w-full flex-col items-start gap-2">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
          {canNavigateToMeeting ? (
            <Link
              href={resolvedJoinHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "primary", size: "sm" }),
                "inline-flex h-8 shrink-0 items-center justify-center active:scale-[0.98]",
              )}
            >
              Join class
            </Link>
          ) : null}
          <div className="flex shrink-0 items-center [&_button]:h-8">
            {meetingDetailsSheet}
          </div>
          {editLinkPopover ? (
            <div className="flex shrink-0 items-center [&_button]:h-8">
              {editLinkPopover}
            </div>
          ) : null}
        </div>
        {meetingScheduledAt ? (
          <p className="w-full max-w-full text-left text-xs text-muted-foreground">
            Link set {formatDateTime(meetingScheduledAt)}
          </p>
        ) : null}
      </div>
    );
  }

  if (tenant && user && !canCreateCourse(tenant, user)) {
    return (
      <div className="flex w-full min-w-0 max-w-sm flex-col gap-3 sm:max-w-md">
        <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/50">
          <MeetingIconTooltip
            size={28}
            tooltip={canNavigateToMeeting ? "Go to meeting" : "Meeting link"}
            ariaLabel="Go to meeting"
            className={cn(
              "shrink-0 rounded-md p-0.5",
              canNavigateToMeeting
                ? "transition-colors hover:bg-accent/50"
                : "opacity-80",
            )}
          />
          <p
            className="min-w-0 flex-1 truncate text-sm text-foreground"
            title={meetingLink}
          >
            {meetingLink}
          </p>
          <CopyButton text={meetingLink} label="meeting link" size={16} />
        </div>
        <TeamsDetails />
        <ZoomMeetingIdDetails />
      </div>
    );
  }
  return (
    <div className="flex w-full min-w-0 max-w-sm flex-col gap-3 sm:max-w-md">
      <Popover.Root
        open={isMeetingLinkEdit}
        onOpenChange={(open) => {
          setIsMeetingLinkEdit(open);
          if (!open) {
            setMeetingLink(toRedirectMeetingLink);
          }
        }}
      >
        <div>
          <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring">
            <div>
              <button type="button" className="inline-flex h-8 items-center justify-center rounded-md px-2 hover:bg-inherit">
                <MeetingIconTooltip
                  size={28}
                  tooltip={canNavigateToMeeting ? "Go to meeting" : "Meeting link"}
                  className="inline-flex"
                />
              </button>
            </div>

            <input
              className="min-w-0 flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              onFocus={() => setIsMeetingLinkEdit(true)}
            />

            <div className="inline-flex items-center">
              <CopyButton
                text={meetingLink}
                label="meeting link"
                size={18}
              />
            </div>
          </div>
        </div>
        <Popover.Portal>
          <Popover.Positioner>
            <Popover.Popup
              className="!w-3xs !px-0 bg-transparent border-0 shadow-none"
              initialFocus={false}
            >
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setIsMeetingLinkEdit(false);
                    setMeetingLink(toRedirectMeetingLink);
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={handleMeetingLinkUpdate} isLoading={isPending}>
                  Update
                </Button>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <TeamsDetails />
      <ZoomMeetingIdDetails />
    </div>
  );
};

export default MeetingLink;
