"use client";
import { Button, Checkbox, Dialog, Select, buttonVariants, useToast } from "@/components/primitives";

import { fetchEntity, updateEntity } from "@/app/client-api/utils";
import {
  calendarMonthsBetweenInclusive,
  monthKey,
  selectedMonthKeysFromPayment,
  type CoverageMonthOption,
} from "@/helpers/payment-coverage-months";
import { invalidateUserPaymentsCaches } from "@/lib/finances/invalidate-user-payments-caches";
import { queryClient } from "@/lib/query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

type UserPaymentApiRow = {
  id: number;
  issued_at: string | null;
  status: string;
  covered_months?: { year: number; month_index: number }[];
};

export type PaymentCoverageEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** UserPayment IDs for this student–course (first used as default). */
  paymentIds: number[];
  courseStartDate?: string | null;
  courseEndDate?: string | null;
  onSaved?: () => void;
};

function selectableMonthsFromCourseDates(
  startIso?: string | null,
  endIso?: string | null,
): CoverageMonthOption[] {
  if (!startIso) return [];
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : new Date(startIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }
  return calendarMonthsBetweenInclusive(start, end);
}

export function PaymentCoverageEditDialog({
  open,
  onOpenChange,
  paymentIds,
  courseStartDate,
  courseEndDate,
  onSaved,
}: PaymentCoverageEditDialogProps) {
  const toast = useToast();
  const [activePaymentId, setActivePaymentId] = useState<number | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || paymentIds.length === 0) {
      return;
    }
    const first = paymentIds[0];
    if (first != null) {
      setActivePaymentId(first);
    }
  }, [open, paymentIds]);

  const selectableMonths = useMemo(
    () => selectableMonthsFromCourseDates(courseStartDate, courseEndDate),
    [courseStartDate, courseEndDate],
  );

  const paymentQuery = useQuery({
    queryKey: ["user-payment-coverage-edit", activePaymentId],
    enabled: open && activePaymentId != null,
    queryFn: async () => {
      const res = await fetchEntity("user-payments", activePaymentId!, []);
      const body = res.data as {
        isError?: boolean;
        message?: string;
        data?: UserPaymentApiRow;
      };
      if (body.isError || body.data == null) {
        throw new Error(body.message ?? "Could not load payment.");
      }
      return body.data;
    },
  });

  useEffect(() => {
    const p = paymentQuery.data;
    if (!p || !open) return;
    setSelectedKeys(selectedMonthKeysFromPayment(p));
  }, [paymentQuery.data, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (activePaymentId == null) throw new Error("No payment selected.");
      const picked = selectableMonths.filter((m) =>
        selectedKeys.has(monthKey(m.year, m.month_index)),
      );
      if (picked.length === 0) {
        throw new Error("Select at least one month.");
      }
      picked.sort((a, b) =>
        a.year !== b.year ? a.year - b.year : a.month_index - b.month_index,
      );
      const first = picked[0];
      const issued = new Date(first.year, first.month_index - 1, 1).toISOString();
      if (picked.length === 1) {
        await updateEntity("user-payments", activePaymentId, {
          issued_at: issued,
          covered_months: [],
        });
        return;
      }
      await updateEntity("user-payments", activePaymentId, {
        issued_at: issued,
        covered_months: picked.map((x) => ({
          year: x.year,
          month_index: x.month_index,
        })),
      });
    },
    onSuccess: () => {
      toast.add({ description: "Coverage updated." });
      void queryClient.invalidateQueries({
        queryKey: ["user-payments-coverage-review"],
      });
      void invalidateUserPaymentsCaches(queryClient);
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof Error ? e.message : "Could not save coverage.";
      toast.add({ type: "error", title: "Error", description: msg });
    },
  });

  const disableMonthPickers =
    selectableMonths.length === 0 || paymentQuery.isLoading;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <div>
          <Dialog.Title>Edit calendar coverage</Dialog.Title>
          <p className="text-sm text-muted-foreground">
            Choose which months this payment applies to. One month uses schedule
            dates only; several months store explicit coverage (same idea as the
            upload page).
          </p>
        </div>

        {paymentIds.length > 1 ? (
          <div className="space-y-2">
            <label>Payment record</label>
            <Select
              value={activePaymentId != null ? String(activePaymentId) : ""}
              onValueChange={(v) => setActivePaymentId(Number(v))}
              placeholder="Select payment"
              items={paymentIds.map((id) => ({
                value: String(id),
                label: `Payment #${id}`,
              }))}
            />
          </div>
        ) : null}

        {paymentQuery.isError ? (
          <p className="text-sm text-destructive" role="alert">
            Could not load this payment.
          </p>
        ) : null}

        {paymentQuery.isFetching && open ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : null}

        {selectableMonths.length === 0 && !paymentQuery.isFetching ? (
          <p className="text-sm text-muted-foreground">
            Add course start/end dates to pick months, or open this payment from
            a course with dates set.
          </p>
        ) : selectableMonths.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label id="months-covered-label">Months covered</label>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={disableMonthPickers}
                  onClick={() =>
                    setSelectedKeys(
                      new Set(
                        selectableMonths.map((m) =>
                          monthKey(m.year, m.month_index),
                        ),
                      ),
                    )
                  }
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={disableMonthPickers}
                  onClick={() => setSelectedKeys(new Set())}
                >
                  Clear all
                </Button>
              </div>
            </div>
            <div
              className="grid max-h-52 gap-2 overflow-y-auto rounded-md border p-2 sm:grid-cols-2"
              aria-labelledby="months-covered-label"
            >
              {selectableMonths.map((m) => {
                const key = monthKey(m.year, m.month_index);
                const checked = selectedKeys.has(key);
                return (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        const next = new Set(selectedKeys);
                        if (v === true) next.add(key);
                        else next.delete(key);
                        setSelectedKeys(next);
                      }}
                    />
                    <span>{m.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            isLoading={saveMutation.isPending}
            disabled={
              paymentIds.length === 0 ||
              activePaymentId == null ||
              disableMonthPickers ||
              paymentQuery.isError ||
              selectableMonths.length === 0
            }
            onClick={() => saveMutation.mutate()}
          >
            Save coverage
          </Button>
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
