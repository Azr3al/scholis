"use client";

import { createContext, useContext } from "react";
import type { UseAutosaveFormReturn } from "@/hooks/use-autosave-form";
import { GlobalAutosaveStatus } from "@/components/form/autosave-status";

const AutosaveContext = createContext<UseAutosaveFormReturn | null>(null);

export function AutosaveProvider({
  value,
  children,
  showGlobalStatus = true,
}: {
  value: UseAutosaveFormReturn;
  children: React.ReactNode;
  /** When false, only per-field badges are shown (e.g. multiple group forms on one page). */
  showGlobalStatus?: boolean;
}) {
  return (
    <AutosaveContext.Provider value={value}>
      {children}
      {showGlobalStatus ? (
        <GlobalAutosaveStatus
          status={value.status}
          onRetryAll={value.retryAll}
        />
      ) : null}
    </AutosaveContext.Provider>
  );
}

export function useAutosaveContext(): UseAutosaveFormReturn | null {
  return useContext(AutosaveContext);
}
