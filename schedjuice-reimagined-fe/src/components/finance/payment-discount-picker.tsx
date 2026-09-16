"use client";

import { Button, Checkbox, Field, Skeleton } from "@/components/primitives";
import { formatPlainAmount } from "@/helpers/money";
import { axiosClient } from "@/lib/api";
import { resolveListItemPresence } from "@/lib/sj/motion";
import type { Discount, EnrollmentDiscount } from "@/types/finance";
import { DiscountEligibilityType, formatDiscountScope } from "@/types/finance";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useMemo } from "react";

export type PaymentDiscountSelection = {
  discountIds: number[];
};

type EligibleDiscountsResponse = {
  current: EnrollmentDiscount | EnrollmentDiscount[] | null;
  discounts: Discount[];
};

function normalizeCurrents(
  current: EligibleDiscountsResponse["current"],
): EnrollmentDiscount[] {
  if (current == null) return [];
  return Array.isArray(current) ? current : [current];
}

function formatCatalogOption(d: Discount): string {
  if (d.discount_type === "percent") {
    return `${d.name} · ${d.percent_value}% · ${formatDiscountScope(d.scope)}`;
  }
  return `${d.name} · ${formatPlainAmount(d.fixed_amount)} off · ${formatDiscountScope(d.scope)}`;
}

/** Locks billing-card height while discount data loads (DESIGN.md §12). */
export const paymentDiscountPickerSlotClassName = "min-h-[7.5rem]";

export function PaymentDiscountPickerSkeleton() {
  return (
    <Field.Root aria-busy="true" className={paymentDiscountPickerSlotClassName}>
      <Field.Label>Discounts</Field.Label>
      <Skeleton className="h-10 min-w-[16rem] w-64 rounded-md" />
      <Field.Description>
        Applies to this student&apos;s enrollment for this course. Multiple
        eligible discounts can stack.
      </Field.Description>
    </Field.Root>
  );
}

export function PaymentDiscountPicker({
  userCourseId,
  asOf,
  value,
  onChange,
  disabled,
}: {
  userCourseId: number;
  asOf?: string;
  value: PaymentDiscountSelection;
  onChange: (next: PaymentDiscountSelection) => void;
  disabled?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const presence = resolveListItemPresence(reduceMotion);
  const uid = useId();

  const query = useQuery({
    queryKey: ["eligible-discounts", userCourseId, asOf ?? ""],
    queryFn: async () => {
      const params = asOf ? { as_of: asOf } : undefined;
      const res = await axiosClient.get(
        `user-courses/${userCourseId}/eligible-discounts`,
        { params },
      );
      return res.data?.data as EligibleDiscountsResponse;
    },
  });

  const currentTemplateIds = useMemo(() => {
    return normalizeCurrents(query.data?.current ?? null)
      .map((ed) => ed.discount)
      .filter((id): id is number => id != null);
  }, [query.data?.current]);

  const options = useMemo(() => {
    const list = [...(query.data?.discounts ?? [])];
    const currents = normalizeCurrents(query.data?.current ?? null);
    for (const current of currents) {
      if (
        current.discount != null &&
        !list.some((d) => d.id === current.discount)
      ) {
        list.unshift({
          id: current.discount,
          name: current.discount_name ?? `Discount #${current.discount}`,
          discount_type: current.snapshot_discount_type,
          percent_value: current.snapshot_percent_value
            ? Number(current.snapshot_percent_value)
            : null,
          fixed_amount: current.snapshot_fixed_amount
            ? Number(current.snapshot_fixed_amount)
            : null,
          scope: current.snapshot_scope,
          eligibility_type:
            current.snapshot_eligibility_type ?? DiscountEligibilityType.none,
          is_active: true,
        });
      }
    }
    return list;
  }, [query.data]);

  useEffect(() => {
    if (query.data == null) return;
    onChange({ discountIds: currentTemplateIds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTemplateIds.join(","), query.dataUpdatedAt]);

  if (query.isError) {
    return (
      <p className="text-sm text-danger" role="alert">
        Could not load discounts for this enrollment.
      </p>
    );
  }

  if (query.isLoading) {
    return <PaymentDiscountPickerSkeleton />;
  }

  const toggle = (id: number, checked: boolean) => {
    const next = new Set(value.discountIds);
    if (checked) next.add(id);
    else next.delete(id);
    onChange({ discountIds: Array.from(next) });
  };

  return (
    <Field.Root className={paymentDiscountPickerSlotClassName}>
      <Field.Label>Discounts</Field.Label>
      <div className="flex min-h-10 flex-col gap-2">
        {options.length === 0 ? (
          <p className="text-sm text-muted">No eligible discounts.</p>
        ) : (
          <ul className="space-y-1.5">
            {options.map((d) => {
              const checked = value.discountIds.includes(d.id);
              const inputId = `${uid}-discount-${d.id}`;
              return (
                <li key={d.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(v) => toggle(d.id, v === true)}
                  />
                  <label htmlFor={inputId}>
                    {formatCatalogOption(d)}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {/* Reserve sm button height (h-8) so Clear all never shifts the description. */}
        <div className="relative h-8">
          <AnimatePresence initial={false}>
            {value.discountIds.length > 0 ? (
              <motion.div
                key="clear-all"
                variants={presence}
                initial="initial"
                animate="animate"
                exit="exit"
                className="absolute inset-y-0 left-0 w-fit"
              >
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  className="w-fit"
                  onClick={() => onChange({ discountIds: [] })}
                >
                  Clear all
                </Button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      <Field.Description>
        Applies to this student&apos;s enrollment for this course. Multiple
        eligible discounts can stack.
      </Field.Description>
    </Field.Root>
  );
}

export function appendDiscountSelectionToFormData(
  fd: FormData,
  selection: PaymentDiscountSelection,
): void {
  if (selection.discountIds.length === 0) {
    fd.append("clear_discount", "true");
    return;
  }
  for (const id of selection.discountIds) {
    fd.append("discount_ids", String(id));
  }
}
