"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { buildVisibleWorkspaces } from "@/config/workspaces";
import { useFindPage } from "@/components/find-page/use-find-page";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { WorkspacesDialog } from "./workspaces-dialog";
import { WorkspacesContext } from "./use-workspaces";

export function WorkspacesProvider({ children }: { children: ReactNode }) {
  const { user } = useUser(false);
  const checker = usePermissions();
  const { tenant } = useTenant();
  const findPage = useFindPage();
  const [open, setOpenState] = useState(false);

  const workspaces = useMemo(
    () => buildVisibleWorkspaces({ checker, tenant, user }),
    [checker, tenant, user],
  );

  const setOpen = useCallback(
    (next: boolean) => {
      if (next) findPage.setOpen(false);
      setOpenState(next);
    },
    [findPage],
  );

  useEffect(() => {
    if (findPage.open) setOpenState(false);
  }, [findPage.open]);

  const value = useMemo(
    () => ({ open, setOpen, workspaces }),
    [open, setOpen, workspaces],
  );

  return (
    <WorkspacesContext.Provider value={value}>
      {children}
      <WorkspacesDialog />
    </WorkspacesContext.Provider>
  );
}
