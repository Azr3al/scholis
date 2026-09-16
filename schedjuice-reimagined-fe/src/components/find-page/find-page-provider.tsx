"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildFindPageItems } from "@/config/find-page-items";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { isTypingTarget } from "@/lib/is-typing-target";
import {
  hasSeenFindPageCoachmark,
  hasSeenFindPageDialog,
  markFindPageCoachmarkSeen,
  markFindPageDialogSeen,
  replayFindPageOnboarding as clearOnboardingStorage,
} from "@/lib/find-page-onboarding-storage";
import {
  FindPageContext,
  type FindPageHeaderChrome,
  type FindPagePanelRect,
} from "./use-find-page";
import { FindPageDialog } from "./find-page-dialog";
import { FindPageOnboarding } from "./find-page-onboarding";
import { useGlobalOverlayActive } from "@/lib/ui/global-overlay-registry";

export function FindPageProvider({ children }: { children: ReactNode }) {
  const { user } = useUser(false);
  const checker = usePermissions();
  const { tenant } = useTenant();
  const { effectiveFullscreen } = useFullscreen();
  const overlayActive = useGlobalOverlayActive();

  const [open, setOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [coachmarkOpen, setCoachmarkOpen] = useState(false);
  const [panelRect, setPanelRect] = useState<FindPagePanelRect | null>(null);
  const [headerChrome, setHeaderChrome] = useState<FindPageHeaderChrome | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const coachmarkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const measurePanel = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPanelRect({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      centerX: r.left + r.width / 2,
      centerY: r.top + r.height / 2,
    });
  }, []);

  const items = useMemo(
    () =>
      buildFindPageItems({
        checker,
        tenant,
        user,
      }),
    [checker, tenant, user],
  );

  const scheduleCoachmark = useCallback(() => {
    if (coachmarkTimerRef.current) clearTimeout(coachmarkTimerRef.current);
    coachmarkTimerRef.current = setTimeout(() => {
      if (!hasSeenFindPageCoachmark()) {
        setCoachmarkOpen(true);
      }
    }, 300);
  }, []);

  const dismissWelcome = useCallback(() => {
    markFindPageDialogSeen();
    setWelcomeOpen(false);
    scheduleCoachmark();
  }, [scheduleCoachmark]);

  const dismissCoachmark = useCallback(() => {
    markFindPageCoachmarkSeen();
    setCoachmarkOpen(false);
  }, []);

  const replayOnboarding = useCallback(() => {
    if (coachmarkTimerRef.current) clearTimeout(coachmarkTimerRef.current);
    clearOnboardingStorage();
    setCoachmarkOpen(false);
    setWelcomeOpen(true);
  }, []);

  useEffect(() => {
    if (effectiveFullscreen) return;
    if (!hasSeenFindPageDialog()) {
      setWelcomeOpen(true);
    }
  }, [effectiveFullscreen]);

  useEffect(() => {
    return () => {
      if (coachmarkTimerRef.current) clearTimeout(coachmarkTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;

    measurePanel();
    const ro = new ResizeObserver(measurePanel);
    ro.observe(el);
    window.addEventListener("resize", measurePanel);
    window.addEventListener("scroll", measurePanel, true);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measurePanel);
      window.removeEventListener("scroll", measurePanel, true);
    };
  }, [measurePanel, effectiveFullscreen]);

  useEffect(() => {
    if (overlayActive && open) setOpen(false);
  }, [overlayActive, open]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "k") return;
      if (overlayActive) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      setOpen((prev) => !prev);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [overlayActive]);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      items,
      triggerRef,
      panelRef,
      panelRect,
      headerChrome,
      setHeaderChrome,
      replayOnboarding,
      welcomeOpen,
      setWelcomeOpen,
      coachmarkOpen,
      setCoachmarkOpen,
    }),
    [open, items, panelRect, headerChrome, replayOnboarding, welcomeOpen, coachmarkOpen],
  );

  return (
    <FindPageContext.Provider value={value}>
      {children}
      {!effectiveFullscreen ? <FindPageDialog /> : null}
      <FindPageOnboarding
        welcomeOpen={welcomeOpen}
        onWelcomeDismiss={dismissWelcome}
        coachmarkOpen={coachmarkOpen}
        onCoachmarkDismiss={dismissCoachmark}
        triggerRef={triggerRef}
      />
    </FindPageContext.Provider>
  );
}
