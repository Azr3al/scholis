"use client";

import * as React from "react";

import type { EntityComboboxOption } from "./entity-combobox-list";

type UseDebouncedFetchOptionsArgs = {
  fetchOptions: (searchValue: string) => Promise<EntityComboboxOption[]>;
  /** When false, fetches are skipped (e.g. popover closed). */
  enabled: boolean;
  searchValue: string;
  initialSearchValue?: string;
  debounceMilliseconds?: number;
  cacheMilliseconds?: number;
};

export function useDebouncedFetchOptions({
  fetchOptions,
  enabled,
  searchValue,
  initialSearchValue = "",
  debounceMilliseconds = 700,
  cacheMilliseconds = 60_000,
}: UseDebouncedFetchOptionsArgs) {
  const [options, setOptions] = React.useState<EntityComboboxOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  const latestRequestIdRef = React.useRef(0);
  const cacheRef = React.useRef<
    Map<string, { cachedAtMilliseconds: number; options: EntityComboboxOption[] }>
  >(new Map());

  const runFetch = React.useCallback(
    async (nextSearchValue: string) => {
      const normalizedSearchValue = nextSearchValue.trim();

      const cachedValue = cacheRef.current.get(normalizedSearchValue);
      if (
        cachedValue &&
        Date.now() - cachedValue.cachedAtMilliseconds <= cacheMilliseconds
      ) {
        setFetchError(null);
        setOptions(cachedValue.options);
        setIsLoading(false);
        return;
      }

      const requestId = latestRequestIdRef.current + 1;
      latestRequestIdRef.current = requestId;

      setIsLoading(true);
      setFetchError(null);
      try {
        const nextOptions = await fetchOptions(normalizedSearchValue);
        if (latestRequestIdRef.current !== requestId) {
          return;
        }

        cacheRef.current.set(normalizedSearchValue, {
          cachedAtMilliseconds: Date.now(),
          options: nextOptions,
        });
        setOptions(nextOptions);
      } catch {
        if (latestRequestIdRef.current !== requestId) {
          return;
        }
        setOptions([]);
        setFetchError("Couldn't load results.");
      } finally {
        if (latestRequestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    },
    [cacheMilliseconds, fetchOptions],
  );

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    if (searchValue === initialSearchValue) {
      runFetch(searchValue);
      return;
    }

    const timer = setTimeout(() => {
      runFetch(searchValue);
    }, debounceMilliseconds);

    return () => clearTimeout(timer);
  }, [
    debounceMilliseconds,
    enabled,
    initialSearchValue,
    runFetch,
    searchValue,
  ]);

  const clearFetchError = React.useCallback(() => {
    setFetchError(null);
  }, []);

  return {
    options,
    isLoading,
    fetchError,
    clearFetchError,
  };
}
