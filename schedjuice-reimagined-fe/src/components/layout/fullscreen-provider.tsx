"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { parseAsBoolean, useQueryState } from "nuqs";

import {
  DEFAULT_FULLSCREEN_LABEL,
  FullscreenContext,
  type FullscreenAvailabilityConfig,
} from "@/hooks/use-fullscreen";
import {
  deriveEffectiveFullscreen,
  shouldClearRequestedFullscreen,
} from "@/lib/fullscreen/fullscreen-state";

const DEFAULT_AVAILABILITY: FullscreenAvailabilityConfig = {
  enabled: false,
  label: DEFAULT_FULLSCREEN_LABEL,
};

interface FullscreenProviderProps {
  children: ReactNode;
}

export function FullscreenProvider({ children }: FullscreenProviderProps) {
  return (
    <Suspense fallback={null}>
      <FullscreenProviderInner>{children}</FullscreenProviderInner>
    </Suspense>
  );
}

function FullscreenProviderInner({ children }: FullscreenProviderProps) {
  const pathname = usePathname();
  const [requestedFullscreen, setRequestedFullscreen] = useQueryState(
    "isFullscreen",
    parseAsBoolean.withDefault(false),
  );
  const [availability, setAvailabilityState] =
    useState<FullscreenAvailabilityConfig>(DEFAULT_AVAILABILITY);

  const isFullscreenAvailable = availability.enabled;
  const effectiveFullscreen = deriveEffectiveFullscreen({
    requestedFullscreen,
    isFullscreenAvailable,
  });

  useEffect(() => {
    setAvailabilityState(DEFAULT_AVAILABILITY);
    void setRequestedFullscreen(false);
  }, [pathname, setRequestedFullscreen]);

  useEffect(() => {
    if (
      shouldClearRequestedFullscreen({
        requestedFullscreen,
        isFullscreenAvailable,
      })
    ) {
      void setRequestedFullscreen(false);
    }
  }, [requestedFullscreen, isFullscreenAvailable, setRequestedFullscreen]);

  const setAvailability = useCallback(
    (config: FullscreenAvailabilityConfig) => {
      setAvailabilityState({
        enabled: config.enabled,
        label: config.label ?? DEFAULT_FULLSCREEN_LABEL,
      });
    },
    [],
  );

  const exit = useCallback(() => {
    void setRequestedFullscreen(false);
  }, [setRequestedFullscreen]);

  const enter = useCallback(() => {
    if (!isFullscreenAvailable) return;
    void setRequestedFullscreen(true);
  }, [isFullscreenAvailable, setRequestedFullscreen]);

  const toggle = useCallback(() => {
    if (!isFullscreenAvailable) {
      void setRequestedFullscreen(false);
      return;
    }
    void setRequestedFullscreen(!requestedFullscreen);
  }, [isFullscreenAvailable, requestedFullscreen, setRequestedFullscreen]);

  const value = useMemo(
    () => ({
      isFullscreen: effectiveFullscreen,
      requestedFullscreen,
      effectiveFullscreen,
      isFullscreenAvailable,
      label: availability.label ?? DEFAULT_FULLSCREEN_LABEL,
      toggle,
      enter,
      exit,
      setAvailability,
    }),
    [
      effectiveFullscreen,
      requestedFullscreen,
      isFullscreenAvailable,
      availability.label,
      toggle,
      enter,
      exit,
      setAvailability,
    ],
  );

  return (
    <FullscreenContext.Provider value={value}>
      {children}
    </FullscreenContext.Provider>
  );
}
