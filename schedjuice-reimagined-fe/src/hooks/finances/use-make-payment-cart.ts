"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PendingPaymentRow = {
  id: number;
  invoiced_amount?: string | number | null;
  course?: { id?: number | string | null } | null;
};

export function makePaymentCartStorageKey(userId: string): string {
  return `sj:make-payment-cart:${userId}`;
}

export function readCartIdsFromStorage(userId: string): number[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const raw = window.sessionStorage.getItem(makePaymentCartStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
  } catch {
    return [];
  }
}

export function writeCartIdsToStorage(userId: string, ids: number[]): void {
  if (typeof window === "undefined" || !userId) return;
  window.sessionStorage.setItem(
    makePaymentCartStorageKey(userId),
    JSON.stringify(ids),
  );
}

export function computeCartTotal(
  pendingPayments: PendingPaymentRow[],
  cartIds: ReadonlySet<number>,
): number {
  return pendingPayments.reduce((sum, row) => {
    if (!cartIds.has(row.id)) return sum;
    return sum + parseFloat(String(row.invoiced_amount ?? 0));
  }, 0);
}

export function resolveDeepLinkPaymentId(
  pendingPayments: PendingPaymentRow[],
  courseIdParam: string | null | undefined,
): number | null {
  if (!courseIdParam) return null;
  const courseId = Number(courseIdParam);
  if (!Number.isFinite(courseId)) return null;
  const match = pendingPayments.find(
    (row) => Number(row.course?.id) === courseId,
  );
  return match?.id ?? null;
}

export function useMakePaymentCart(args: {
  userId: string;
  pendingPayments: PendingPaymentRow[];
  courseIdParam?: string | null;
}) {
  const { userId, pendingPayments, courseIdParam } = args;
  const pendingIds = useMemo(
    () => new Set(pendingPayments.map((row) => row.id)),
    [pendingPayments],
  );
  const [cartIds, setCartIds] = useState<number[]>([]);
  const deepLinkAppliedRef = useRef(false);

  useEffect(() => {
    if (!userId) {
      setCartIds([]);
      return;
    }
    const stored = readCartIdsFromStorage(userId).filter((id) =>
      pendingIds.has(id),
    );
    setCartIds(stored);
  }, [userId, pendingIds]);

  useEffect(() => {
    if (deepLinkAppliedRef.current || !userId || pendingPayments.length === 0) {
      return;
    }
    const paymentId = resolveDeepLinkPaymentId(pendingPayments, courseIdParam);
    if (paymentId == null) return;
    deepLinkAppliedRef.current = true;
    setCartIds((current) =>
      current.includes(paymentId) ? current : [...current, paymentId],
    );
  }, [courseIdParam, pendingPayments, userId]);

  useEffect(() => {
    if (!userId) return;
    writeCartIdsToStorage(userId, cartIds);
  }, [cartIds, userId]);

  const cartIdSet = useMemo(() => new Set(cartIds), [cartIds]);

  const add = useCallback((id: number) => {
    setCartIds((current) => (current.includes(id) ? current : [...current, id]));
  }, []);

  const remove = useCallback((id: number) => {
    setCartIds((current) => current.filter((value) => value !== id));
  }, []);

  const toggle = useCallback((id: number) => {
    setCartIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }, []);

  const clear = useCallback(() => {
    setCartIds([]);
  }, []);

  const total = useMemo(
    () => computeCartTotal(pendingPayments, cartIdSet),
    [cartIdSet, pendingPayments],
  );

  const isInCart = useCallback((id: number) => cartIdSet.has(id), [cartIdSet]);

  return {
    cartIds,
    cartIdSet,
    add,
    remove,
    toggle,
    clear,
    total,
    isInCart,
  };
}
