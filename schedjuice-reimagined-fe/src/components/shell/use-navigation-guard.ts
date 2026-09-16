"use client";
import { useCallback } from "react";

/**
 * Returns whether in-app navigation to `href` should proceed.
 * Extend when record edit dirty state exists — see spec §5.3 in
 * docs/superpowers/specs/2026-06-22-record-mode-global-nav-design.md
 */
export function useNavigationGuard() {
  const confirmNavigation = useCallback((_href: string): boolean => {
    return true;
  }, []);
  return { confirmNavigation };
}
