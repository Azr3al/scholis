"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

type Props = {
  startedAt: string;
  allowedMinutes: number;
  /** Called once when the timer reaches zero (including if already past due on load). */
  onExpire: () => void;
  className?: string;
};

export function QuizTimer({ startedAt, allowedMinutes, onExpire, className }: Props) {
  const expireNotifiedRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const prevRemainingRef = useRef<number | null>(null);

  const [remaining, setRemaining] = useState<number>(() => {
    const end = new Date(startedAt).getTime() + allowedMinutes * 60 * 1000;
    return Math.max(0, Math.floor((end - Date.now()) / 1000));
  });

  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    expireNotifiedRef.current = false;
    prevRemainingRef.current = null;
    const end = new Date(startedAt).getTime() + allowedMinutes * 60 * 1000;
    setRemaining(Math.max(0, Math.floor((end - Date.now()) / 1000)));
  }, [startedAt, allowedMinutes]);

  useEffect(() => {
    let cancelled = false;
    const fireExpire = () => {
      if (cancelled || expireNotifiedRef.current) return;
      expireNotifiedRef.current = true;
      onExpireRef.current();
    };

    let intervalId: number | undefined;

    const tick = () => {
      const end = new Date(startedAt).getTime() + allowedMinutes * 60 * 1000;
      const sec = Math.max(0, Math.floor((end - Date.now()) / 1000));
      const prev = prevRemainingRef.current;
      prevRemainingRef.current = sec;
      setRemaining(sec);

      if (prev != null) {
        if (prev > 300 && sec <= 300 && sec > 0) {
          setAnnouncement("Five minutes remaining.");
        } else if (prev > 60 && sec <= 60 && sec > 0) {
          setAnnouncement("One minute remaining.");
        }
      }

      if (sec <= 0) {
        fireExpire();
        if (intervalId != null) window.clearInterval(intervalId);
      }
    };

    tick();
    intervalId = window.setInterval(tick, 1000);

    return () => {
      cancelled = true;
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, [startedAt, allowedMinutes]);

  useEffect(() => {
    if (!announcement) return;
    const t = window.setTimeout(() => setAnnouncement(""), 3000);
    return () => window.clearTimeout(t);
  }, [announcement]);

  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  const pastDue = remaining <= 0;
  const urgent = remaining <= 60 && !pastDue;
  const warm = remaining <= 300 && !pastDue && !urgent;

  return (
    <div
      className={cn(
        "rounded-md px-3 py-2 text-center text-sm font-medium tabular-nums transition-colors duration-300",
        pastDue
          ? "bg-surface-sunken text-text-muted"
          : urgent
            ? "border border-destructive/55 bg-danger/12 text-text-primary"
            : warm
              ? "border border-amber-500/50 bg-amber-500/12 text-text-primary"
              : "bg-surface-sunken text-text-muted",
        className,
      )}
    >
      {announcement ? (
        <div className="sr-only" aria-live="polite" aria-atomic>
          {announcement}
        </div>
      ) : null}
      <div aria-live="polite">
        Time left: {m}:{s.toString().padStart(2, "0")}
      </div>
      {pastDue ? (
        <p className="mt-1 text-xs font-normal normal-case">
          Time is up. You can still submit your answers.
        </p>
      ) : null}
    </div>
  );
}
