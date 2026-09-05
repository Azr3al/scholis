"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { playClick } from "@/lib/sound/click-sound";
import { parseSidebarCookie, writeSidebarCookie } from "./sidebar-cookie";

/** Per-page header content registered by route components (breadcrumb, actions, toolbar). */
export type PageHeaderConfig = {
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  toolbarSecondary?: ReactNode;
};

export type ContextRailParent = {
  label: string;
  href: string;
};

export type ContextRailConfig = {
  parent: ContextRailParent;
  Rail: ComponentType<Record<string, unknown>>;
  getProps: () => Record<string, unknown> | null;
};

type SidebarState = {
  open: boolean;
  setOpen: (v: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (v: boolean) => void;
  isMobile: boolean;
  toggle: () => void;
  /** A record-scoped rail registered by a nested layout (P2b). Null = global nav. */
  contextRail: ContextRailConfig | null;
  setContextRail: (config: ContextRailConfig | null) => void;
  /** Bumped when the active layout re-renders so the shell picks up fresh rail props. */
  railRevision: number;
  bumpContextRailRevision: () => void;
  /** True when a context rail is active — collapses the global rail to icons. */
  recordMode: boolean;
  /** Custom header chrome registered by the active page. Null = default nav title. */
  pageHeader: PageHeaderConfig | null;
  setPageHeader: (config: PageHeaderConfig | null) => void;
};

const SidebarContext = createContext<SidebarState | null>(null);

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [open, setOpenState] = useState(true);
  const [openMobile, setOpenMobile] = useState(false);
  const [contextRail, setContextRail] = useState<ContextRailConfig | null>(null);
  const [railRevision, setRailRevision] = useState(0);
  const [pageHeader, setPageHeaderState] = useState<PageHeaderConfig | null>(null);

  const bumpContextRailRevision = useCallback(() => {
    setRailRevision((v) => v + 1);
  }, []);

  const setPageHeader = useCallback((config: PageHeaderConfig | null) => {
    setPageHeaderState((prev) => {
      if (
        prev === config ||
        (prev != null &&
          config != null &&
          prev.breadcrumb === config.breadcrumb &&
          prev.actions === config.actions &&
          prev.toolbar === config.toolbar &&
          prev.toolbarSecondary === config.toolbarSecondary)
      ) {
        return prev;
      }
      return config;
    });
  }, []);

  // Seed desktop state from the persisted cookie (avoids a flash on reload).
  useEffect(() => {
    setOpenState(parseSidebarCookie(document.cookie));
  }, []);

  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    writeSidebarCookie(v);
  }, []);

  const toggle = useCallback(() => {
    if (isMobile) setOpenMobile((v) => !v);
    else setOpen(!open);
    playClick();
  }, [isMobile, open, setOpen]);

  const recordMode = contextRail !== null;
  const recordModeInitialized = useRef(false);

  useEffect(() => {
    if (!recordModeInitialized.current) {
      recordModeInitialized.current = true;
      return;
    }
    playClick();
  }, [recordMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      openMobile,
      setOpenMobile,
      isMobile,
      toggle,
      contextRail,
      setContextRail,
      railRevision,
      bumpContextRailRevision,
      recordMode,
      pageHeader,
      setPageHeader,
    }),
    [
      open,
      setOpen,
      openMobile,
      isMobile,
      toggle,
      contextRail,
      railRevision,
      bumpContextRailRevision,
      recordMode,
      pageHeader,
      setPageHeader,
    ],
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}
