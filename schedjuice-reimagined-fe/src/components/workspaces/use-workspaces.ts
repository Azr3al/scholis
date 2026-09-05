"use client";

import { createContext, useContext } from "react";
import type { WorkspaceCard } from "@/config/workspaces";

export type WorkspacesContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  workspaces: WorkspaceCard[];
};

export const WorkspacesContext = createContext<WorkspacesContextValue | null>(
  null,
);

export function useWorkspaces(): WorkspacesContextValue {
  const ctx = useContext(WorkspacesContext);
  if (!ctx) {
    throw new Error("useWorkspaces must be used within WorkspacesProvider");
  }
  return ctx;
}
