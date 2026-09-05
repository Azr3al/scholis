import type { QueryClient, QueryKey } from "@tanstack/react-query";

export type QueryCacheSnapshot = {
  queryKey: QueryKey;
  data: unknown;
};

type RowsCache = {
  rows: Array<Record<string, unknown> & { id?: number | string }>;
};

function isRowsCache(data: unknown): data is RowsCache {
  return (
    !!data &&
    typeof data === "object" &&
    Array.isArray((data as RowsCache).rows)
  );
}

/** Pure: return patched cache payload, or null if nothing to change. */
export function applyPaymentRowPatchToCacheData(
  data: unknown,
  paymentId: number | string,
  patch: Record<string, unknown>,
): RowsCache | null {
  if (!isRowsCache(data)) return null;
  const idNorm = String(paymentId);
  let hit = false;
  const rows = data.rows.map((row) => {
    if (row?.id == null || String(row.id) !== idNorm) return row;
    hit = true;
    return { ...row, ...patch };
  });
  if (!hit) return null;
  return { ...data, rows };
}

/**
 * Patch every cached query whose data is `{ rows: [...] }` and contains the payment.
 * Returns snapshots for exact rollback via `restoreQueryCacheSnapshots`.
 */
export function patchPaymentRowInQueryCaches(
  queryClient: QueryClient,
  paymentId: number | string,
  patch: Record<string, unknown>,
): QueryCacheSnapshot[] {
  const snapshots: QueryCacheSnapshot[] = [];
  for (const query of queryClient.getQueryCache().getAll()) {
    const prev = query.state.data;
    const next = applyPaymentRowPatchToCacheData(prev, paymentId, patch);
    if (!next) continue;
    snapshots.push({ queryKey: query.queryKey, data: prev });
    queryClient.setQueryData(query.queryKey, next);
  }
  return snapshots;
}

export function restoreQueryCacheSnapshots(
  queryClient: QueryClient,
  snapshots: QueryCacheSnapshot[],
): void {
  for (const { queryKey, data } of snapshots) {
    queryClient.setQueryData(queryKey, data);
  }
}
