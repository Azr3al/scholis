"use client";

import { createContext, useContext } from "react";
import type { RefObject } from "react";
import type { FindPageItem } from "@/config/find-page-items";

/** Viewport rect of the elevated content panel (for island + dialog alignment). */
export type FindPagePanelRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export type FindPageContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  items: FindPageItem[];
  triggerRef: RefObject<HTMLButtonElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  panelRect: FindPagePanelRect | null;
  replayOnboarding: () => void;
  welcomeOpen: boolean;
  setWelcomeOpen: (open: boolean) => void;
  coachmarkOpen: boolean;
  setCoachmarkOpen: (open: boolean) => void;
};

export const FindPageContext = createContext<FindPageContextValue | null>(null);

export function useFindPage(): FindPageContextValue {
  const ctx = useContext(FindPageContext);
  if (!ctx) {
    throw new Error("useFindPage must be used within FindPageProvider");
  }
  return ctx;
}
