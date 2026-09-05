"use client";

import { useCallback, useEffect, useRef } from "react";

import type { OrgSectionId } from "@/config/org-record-sections";
import { getOrgSectionAnchorElement, scrollOrgSectionIntoView } from "@/lib/org/org-section-anchors";
import {
  pickActiveOrgSection,
  type OrgScrollDirection,
} from "@/lib/org/org-section-scroll-spy";

import { useOrgRecordNavigation } from "./org-record-navigation-context";

const URL_SYNC_DEBOUNCE_MS = 200;

export function useOrgSectionScrollSpy({
  sectionIds,
  urlSection,
  onUrlSectionChange,
  enabled = true,
}: {
  sectionIds: readonly OrgSectionId[];
  urlSection: OrgSectionId;
  onUrlSectionChange: (section: OrgSectionId) => void;
  enabled?: boolean;
}) {
  const navigation = useOrgRecordNavigation();
  const programmaticScrollRef = useRef(false);
  const initialScrollDoneRef = useRef(false);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSectionRef = useRef(urlSection);
  const onUrlSectionChangeRef = useRef(onUrlSectionChange);
  const lastScrollTopRef = useRef(0);

  onUrlSectionChangeRef.current = onUrlSectionChange;
  activeSectionRef.current = navigation?.activeSection ?? urlSection;

  const applyActiveSection = useCallback(
    (next: OrgSectionId, opts?: { syncUrl?: boolean }) => {
      if (!next || next === activeSectionRef.current) return;
      activeSectionRef.current = next;
      navigation?.setActiveSection(next);

      if (opts?.syncUrl === false) return;

      if (urlSyncTimerRef.current) clearTimeout(urlSyncTimerRef.current);
      urlSyncTimerRef.current = setTimeout(() => {
        if (next === activeSectionRef.current) {
          onUrlSectionChangeRef.current(next);
        }
      }, URL_SYNC_DEBOUNCE_MS);
    },
    [navigation],
  );

  const scrollToSection = useCallback(
    (section: OrgSectionId) => {
      programmaticScrollRef.current = true;
      if (urlSyncTimerRef.current) clearTimeout(urlSyncTimerRef.current);
      onUrlSectionChangeRef.current(section);
      navigation?.setActiveSection(section);
      activeSectionRef.current = section;
      scrollOrgSectionIntoView(section, { behavior: "smooth" });
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 800);
    },
    [navigation],
  );

  useEffect(() => {
    if (urlSection === activeSectionRef.current) return;
    navigation?.setActiveSection(urlSection);
    activeSectionRef.current = urlSection;
  }, [navigation, urlSection]);

  useEffect(() => {
    navigation?.registerNavigate(scrollToSection);
  }, [navigation, scrollToSection]);

  useEffect(() => {
    if (!enabled || sectionIds.length === 0) return;
    if (initialScrollDoneRef.current) return;

    const main = document.getElementById("main-content");
    const anchor = getOrgSectionAnchorElement(urlSection);
    if (!main || !anchor) return;

    initialScrollDoneRef.current = true;
    lastScrollTopRef.current = main.scrollTop;
    if (urlSection !== sectionIds[0]) {
      programmaticScrollRef.current = true;
      scrollOrgSectionIntoView(urlSection, { behavior: "auto" });
      navigation?.setActiveSection(urlSection);
      activeSectionRef.current = urlSection;
      scrollEndTimerRef.current = setTimeout(() => {
        programmaticScrollRef.current = false;
        lastScrollTopRef.current = main.scrollTop;
      }, 150);
    } else {
      navigation?.setActiveSection(urlSection);
      activeSectionRef.current = urlSection;
    }
  }, [enabled, navigation, sectionIds, urlSection]);

  useEffect(() => {
    if (!enabled || sectionIds.length === 0) return;

    let disposed = false;
    let scrollRoot: HTMLElement | null = null;
    let scrollFrame = 0;
    let retryTimer: ReturnType<typeof setInterval> | null = null;

    const syncFromScroll = () => {
      if (!scrollRoot || programmaticScrollRef.current) return;

      const scrollTop = scrollRoot.scrollTop;
      const scrollDirection: OrgScrollDirection =
        scrollTop >= lastScrollTopRef.current ? "down" : "up";
      lastScrollTopRef.current = scrollTop;

      const next = pickActiveOrgSection({
        sectionIds,
        scrollRoot,
        scrollDirection,
      });
      if (next) applyActiveSection(next);
    };

    const onScroll = () => {
      if (programmaticScrollRef.current) return;
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(syncFromScroll);
    };

    const attach = () => {
      if (disposed) return true;
      scrollRoot = document.getElementById("main-content");
      if (!scrollRoot) return false;

      lastScrollTopRef.current = scrollRoot.scrollTop;
      scrollRoot.addEventListener("scroll", onScroll, { passive: true });
      syncFromScroll();
      return true;
    };

    const detach = () => {
      if (scrollRoot) {
        scrollRoot.removeEventListener("scroll", onScroll);
        scrollRoot = null;
      }
    };

    if (!attach()) {
      retryTimer = setInterval(() => {
        if (attach() && retryTimer) {
          clearInterval(retryTimer);
          retryTimer = null;
        }
      }, 50);
    }

    return () => {
      disposed = true;
      if (retryTimer) clearInterval(retryTimer);
      cancelAnimationFrame(scrollFrame);
      detach();
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
      if (urlSyncTimerRef.current) clearTimeout(urlSyncTimerRef.current);
    };
  }, [applyActiveSection, enabled, sectionIds]);

  return { scrollToSection };
}
