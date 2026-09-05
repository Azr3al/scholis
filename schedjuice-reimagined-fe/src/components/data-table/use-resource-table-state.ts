"use client";

import { useCallback, useState } from "react";
import type { ResourceTableState } from "./types";

export type ResourceTableStateOptions = {
  namespace: string;
  syncUrl?: boolean;
  initial?: Partial<ResourceTableState>;
};

export type ResourceTableStateHandle = ResourceTableState & {
  namespace: string;
  setState: (patch: Partial<ResourceTableState>) => ResourceTableStateHandle;
};

function createDefaults(): ResourceTableState {
  return {
    page: 1,
    pageSize: 20,
    sorts: [],
    q: "",
    filters: {},
  };
}

function resolveInitialState(
  initial?: Partial<ResourceTableState>,
): ResourceTableState {
  const base = createDefaults();
  if (!initial) return base;

  return {
    ...base,
    ...initial,
    sorts: initial.sorts ? [...initial.sorts] : base.sorts,
    filters: initial.filters ? { ...initial.filters } : base.filters,
  };
}

/** Namespaced URL query keys for future `syncUrl: true` (nuqs). */
export function resourceTableUrlKeys(namespace: string) {
  return {
    page: `${namespace}_page`,
    pageSize: `${namespace}_pageSize`,
    sorts: `${namespace}_sorts`,
    q: `${namespace}_q`,
    filters: `${namespace}_filters`,
  } as const;
}

/**
 * Pure controlled-state helper (testable without RTL).
 * `syncUrl` is reserved for a later nuqs-backed path; local merge is enough for T0.
 */
export function createResourceTableState(
  opts: ResourceTableStateOptions,
  current: ResourceTableState = resolveInitialState(opts.initial),
): ResourceTableStateHandle {
  const setState = (
    patch: Partial<ResourceTableState>,
  ): ResourceTableStateHandle =>
    createResourceTableState(opts, { ...current, ...patch });

  return {
    ...current,
    namespace: opts.namespace,
    setState,
  };
}

export function useResourceTableState(opts: ResourceTableStateOptions) {
  const { namespace, initial } = opts;
  // syncUrl reserved for nuqs; use resourceTableUrlKeys(namespace) when enabled.
  const [state, setFull] = useState<ResourceTableState>(() =>
    resolveInitialState(initial),
  );

  const setState = useCallback((patch: Partial<ResourceTableState>) => {
    setFull((s) => ({ ...s, ...patch }));
  }, []);

  return { ...state, setState, namespace };
}
