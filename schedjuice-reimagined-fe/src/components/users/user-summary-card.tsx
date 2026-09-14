"use client";

import { Mail, User as UserRound } from "iconoir-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type UserSummary = {
  id: number | null;
  name: string;
  email?: string | null;
};

export type UserSummaryTarget = {
  user: UserSummary;
  rect: { x: number; y: number; width: number; height: number };
};

const HOVER_CLOSE_DELAY_MS = 200;

export function initialsForUser(name?: string | null) {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase()).join("") || "U";
}

export function UserSummaryCard({ user }: { user: UserSummary }) {
  const canViewProfile = user.id != null;

  return (
    <div className="w-72 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-[0_16px_40px_-18px_rgba(15,23,42,0.45)]">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {initialsForUser(user.name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
          {canViewProfile ? (
            <p className="truncate text-xs text-slate-500">User #{user.id}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 text-xs text-slate-600">
        <div className="flex min-w-0 items-center gap-2">
          <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          <span className="truncate">{user.email || "No email on file"}</span>
        </div>
        {canViewProfile ? (
          <div className="flex min-w-0 items-center gap-2">
            <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <Link href={`/users/${user.id}`} className="font-medium text-primary hover:underline">
              View profile
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function useHoverBridge() {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, HOVER_CLOSE_DELAY_MS);
  }, [cancelClose]);

  const openNow = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  useEffect(() => {
    return () => cancelClose();
  }, [cancelClose]);

  return { open, openNow, scheduleClose, cancelClose, setOpen };
}

export function UserSummaryInlineHover({
  user,
  children,
}: {
  user: UserSummary;
  children: ReactNode;
}) {
  const hover = useHoverBridge();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={hover.openNow}
      onMouseLeave={hover.scheduleClose}
    >
      {children}
      {hover.open ? (
        <span
          className="absolute left-0 top-full z-30 pt-2"
          onMouseEnter={hover.cancelClose}
          onMouseLeave={hover.scheduleClose}
        >
          <UserSummaryCard user={user} />
        </span>
      ) : null}
    </span>
  );
}

export function UserSummaryPopover({
  target,
  onClose,
  onContentHoverChange,
}: {
  target: UserSummaryTarget | null;
  onClose: () => void;
  onContentHoverChange?: (hovering: boolean) => void;
}) {
  const popoverHoveringRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      if (!popoverHoveringRef.current) {
        onClose();
      }
    }, HOVER_CLOSE_DELAY_MS);
  }, [cancelClose, onClose]);

  useEffect(() => {
    return () => cancelClose();
  }, [cancelClose]);

  useEffect(() => {
    if (!target) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!contentRef.current?.contains(event.target as Node)) {
        popoverHoveringRef.current = false;
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        popoverHoveringRef.current = false;
        onClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, target]);

  if (!target) return null;

  return (
    <div
      ref={contentRef}
      data-user-summary-popover
      className="click-outside-ignore fixed z-dropdown"
      style={{
        left: target.rect.x,
        top: target.rect.y + target.rect.height + 4,
      }}
      onMouseEnter={() => {
        popoverHoveringRef.current = true;
        onContentHoverChange?.(true);
        cancelClose();
      }}
      onMouseLeave={() => {
        popoverHoveringRef.current = false;
        onContentHoverChange?.(false);
        scheduleClose();
      }}
    >
      <UserSummaryCard user={target.user} />
    </div>
  );
}
