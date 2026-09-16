"use client";
import { useEffect } from "react";
import { useSidebar, type PageHeaderConfig } from "./sidebar-context";

/** Register custom header chrome for the duration the calling component is mounted. */
export function usePageHeader(config: PageHeaderConfig | null) {
  const { setPageHeader } = useSidebar();
  useEffect(() => {
    setPageHeader(config);
    return () => setPageHeader(null);
  }, [config, setPageHeader]);
}
