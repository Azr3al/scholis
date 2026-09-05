"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type GlobalOverlayRegistryContextValue = {
  register: () => () => void;
  count: number;
};

const GlobalOverlayRegistryContext =
  createContext<GlobalOverlayRegistryContextValue | null>(null);

export function GlobalOverlayProvider({ children }: { children: ReactNode }) {
  const countRef = useRef(0);
  const [count, setCount] = useState(0);

  const register = useCallback(() => {
    countRef.current += 1;
    setCount(countRef.current);
    return () => {
      countRef.current = Math.max(0, countRef.current - 1);
      setCount(countRef.current);
    };
  }, []);

  const value = useMemo(() => ({ register, count }), [register, count]);

  return (
    <GlobalOverlayRegistryContext.Provider value={value}>
      {children}
    </GlobalOverlayRegistryContext.Provider>
  );
}

export function useGlobalOverlayActive(): boolean {
  const ctx = useContext(GlobalOverlayRegistryContext);
  if (!ctx) return false;
  return ctx.count > 0;
}

/** Increment the global overlay count while `isOpen` is true. */
export function useRegisterGlobalOverlay(isOpen: boolean): void {
  const ctx = useContext(GlobalOverlayRegistryContext);

  useEffect(() => {
    if (!ctx || !isOpen) return;
    return ctx.register();
  }, [ctx, isOpen]);
}
