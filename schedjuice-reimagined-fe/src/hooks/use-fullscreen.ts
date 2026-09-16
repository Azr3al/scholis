"use client";

import { createContext, useContext } from "react";

export interface FullscreenAvailabilityConfig {
  enabled: boolean;
  label?: string;
}

export interface FullscreenContextValue {
  isFullscreen: boolean;
  requestedFullscreen: boolean;
  effectiveFullscreen: boolean;
  isFullscreenAvailable: boolean;
  label: string;
  toggle: () => void;
  enter: () => void;
  exit: () => void;
  setAvailability: (config: FullscreenAvailabilityConfig) => void;
}

export const FullscreenContext = createContext<FullscreenContextValue | null>(
  null,
);

export const DEFAULT_FULLSCREEN_LABEL = "Fullscreen";

export const useFullscreen = () => {
  const context = useContext(FullscreenContext);
  if (!context) {
    throw new Error("useFullscreen must be used within FullscreenProvider.");
  }
  return context;
};
