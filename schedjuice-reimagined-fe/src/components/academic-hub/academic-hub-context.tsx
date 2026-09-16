"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import {
  useAcademicHubQueryState,
  type AcademicHubQueryStateValue,
} from "@/hooks/academic-hub/use-academic-hub-query-state";

type AcademicHubContextValue = AcademicHubQueryStateValue & {
  joinCodeDialogOpen: boolean;
  setJoinCodeDialogOpen: (open: boolean) => void;
};

const AcademicHubContext = createContext<AcademicHubContextValue | null>(null);

export function AcademicHubProvider({ children }: { children: ReactNode }) {
  const queryState = useAcademicHubQueryState();
  const [joinCodeDialogOpen, setJoinCodeDialogOpen] = useState(false);
  const value: AcademicHubContextValue = {
    ...queryState,
    joinCodeDialogOpen,
    setJoinCodeDialogOpen,
  };
  return (
    <AcademicHubContext.Provider value={value}>
      {children}
    </AcademicHubContext.Provider>
  );
}

export function useAcademicHubContext(): AcademicHubContextValue {
  const value = useContext(AcademicHubContext);
  if (!value) {
    throw new Error("useAcademicHubContext requires AcademicHubProvider");
  }
  return value;
}
