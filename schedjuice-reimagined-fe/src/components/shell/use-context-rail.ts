"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ComponentType,
} from "react";
import type { ContextRailParent } from "./sidebar-context";
import { useSidebar } from "./sidebar-context";

function propsRevisionKey(props: Record<string, unknown> | null): string {
  if (props === null) {
    return "null";
  }
  try {
    return JSON.stringify(props, (_key, value) =>
      typeof value === "function" ? undefined : value,
    );
  } catch {
    return String(Object.keys(props).join(","));
  }
}

/** Register a record-scoped rail for the duration the calling component is mounted. */
export function useContextRail<P extends Record<string, unknown> | null>(
  Rail: ComponentType<NonNullable<P>>,
  getProps: () => P,
  parent: ContextRailParent,
) {
  const { setContextRail, bumpContextRailRevision } = useSidebar();
  const getPropsRef = useRef(getProps);
  getPropsRef.current = getProps;
  const prevKeyRef = useRef<string>("");

  useEffect(() => {
    setContextRail({
      parent,
      Rail: Rail as ComponentType<Record<string, unknown>>,
      getProps: () => getPropsRef.current() as Record<string, unknown> | null,
    });
    return () => setContextRail(null);
  }, [parent.href, parent.label, setContextRail, Rail]);

  useLayoutEffect(() => {
    const key = propsRevisionKey(getPropsRef.current() as Record<string, unknown> | null);
    if (key === prevKeyRef.current) {
      return;
    }
    prevKeyRef.current = key;
    bumpContextRailRevision();
  });
}
