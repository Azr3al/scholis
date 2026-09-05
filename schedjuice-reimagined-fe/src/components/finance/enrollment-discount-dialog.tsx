"use client";
import { Button, Dialog, Input, Select } from "@/components/primitives";

import { formatPlainAmount } from "@/helpers/money";
import { axiosClient } from "@/lib/api";
import {
  Discount,
  DiscountPreviewPeriod,
  DiscountType,
  EnrollmentDiscount,
  formatDiscountScope,
} from "@/types/finance";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

const NONE_VALUE = "__none__";

function normalizeEnrollmentDiscounts(
  data: EnrollmentDiscount | EnrollmentDiscount[] | null | undefined,
): EnrollmentDiscount[] {
  if (data == null) return [];
  return Array.isArray(data) ? data : [data];
}

function formatDiscountLabel(discount: EnrollmentDiscount | null | undefined) {
  if (!discount) return null;
  const name = discount.discount_name ?? "Custom discount";
  if (discount.snapshot_discount_type === DiscountType.percent) {
    return `${name} · ${discount.snapshot_percent_value}% · ${formatDiscountScope(discount.snapshot_scope)}`;
  }
  return `${name} · ${formatPlainAmount(discount.snapshot_fixed_amount)} off · ${formatDiscountScope(discount.snapshot_scope)}`;
}

function formatCatalogOption(d: Discount): string {
  if (d.discount_type === "percent") {
    return `${d.name} · ${d.percent_value}% · ${formatDiscountScope(d.scope)}`;
  }
  return `${d.name} · ${formatPlainAmount(d.fixed_amount)} off · ${formatDiscountScope(d.scope)}`;
}

export function EnrollmentDiscountDialog({
  userCourseId,
  canConfigure,
}: {
  userCourseId: number;
  canConfigure: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [discountId, setDiscountId] = useState<number | undefined>();
  const [reason, setReason] = useState("");

  const discountQuery = useQuery({
    queryKey: ["enrollment-discount", userCourseId],
    queryFn: async () => {
      const res = await axiosClient.get(`user-courses/${userCourseId}/discount`);
      return normalizeEnrollmentDiscounts(
        (res.data?.data ?? null) as
          | EnrollmentDiscount
          | EnrollmentDiscount[]
          | null,
      );
    },
  });

  const eligibleQuery = useQuery({
    queryKey: ["eligible-discounts", userCourseId],
    enabled: open,
    queryFn: async () => {
      const res = await axiosClient.get(
        `user-courses/${userCourseId}/eligible-discounts`,
      );
      return res.data?.data as {
        current: EnrollmentDiscount | EnrollmentDiscount[] | null;
        discounts: Discount[];
      };
    },
  });

  const activeDiscounts = discountQuery.data ?? [];

  const previewQuery = useQuery({
    queryKey: [
      "enrollment-discount-preview",
      userCourseId,
      activeDiscounts.map((d) => d.id).join(","),
    ],
    enabled: open,
    queryFn: async () => {
      const res = await axiosClient.get(
        `user-courses/${userCourseId}/discount-preview`,
      );
      return (res.data?.data?.periods ?? []) as DiscountPreviewPeriod[];
    },
  });

  const activeTemplateIds = useMemo(
    () =>
      new Set(
        activeDiscounts
          .map((ed) => ed.discount)
          .filter((id): id is number => id != null),
      ),
    [activeDiscounts],
  );

  const selectItems = useMemo(() => {
    const list = (eligibleQuery.data?.discounts ?? []).filter(
      (d) => !activeTemplateIds.has(d.id),
    );
    return [
      { value: NONE_VALUE, label: "Select discount to add" },
      ...list.map((d) => ({
        value: String(d.id),
        label: formatCatalogOption(d),
      })),
    ];
  }, [eligibleQuery.data, activeTemplateIds]);

  const invalidateDiscountQueries = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["enrollment-discount", userCourseId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["enrollment-discount-preview", userCourseId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["eligible-discounts", userCourseId],
    });
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!discountId) throw new Error("Select a discount");
      await axiosClient.post(`user-courses/${userCourseId}/discount`, {
        discount_id: discountId,
        reason,
      });
    },
    onSuccess: async () => {
      await invalidateDiscountQueries();
      setDiscountId(undefined);
      setReason("");
    },
  });

  const removeOneMutation = useMutation({
    mutationFn: async (enrollmentDiscountId: number) => {
      await axiosClient.delete(
        `user-courses/${userCourseId}/discount/${enrollmentDiscountId}`,
      );
    },
    onSuccess: async () => {
      await invalidateDiscountQueries();
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      await axiosClient.delete(`user-courses/${userCourseId}/discount`);
    },
    onSuccess: async () => {
      await invalidateDiscountQueries();
    },
  });

  const activeSummary = useMemo(() => {
    if (activeDiscounts.length === 0) return null;
    return activeDiscounts
      .map((ed) => formatDiscountLabel(ed))
      .filter(Boolean)
      .join(" + ");
  }, [activeDiscounts]);

  if (!canConfigure && !activeSummary) {
    return null;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {activeSummary ? (
        <span className="inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary font-normal">
          {activeSummary}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">No discount</span>
      )}
      {canConfigure ? (
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger
            render={
              <Button type="button" size="sm" variant="secondary">
                {activeSummary ? "Manage discounts" : "Apply discount"}
              </Button>
            }
          />
          <Dialog.Portal>
            <Dialog.Backdrop />
            <Dialog.Popup>
              <div>
                <Dialog.Title>Enrollment discounts</Dialog.Title>
              </div>
              <div className="space-y-4">
                {activeDiscounts.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Active stack</p>
                    <ul className="space-y-2">
                      {activeDiscounts.map((ed) => (
                        <li
                          key={ed.id}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span>{formatDiscountLabel(ed)}</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            isLoading={
                              removeOneMutation.isPending &&
                              removeOneMutation.variables === ed.id
                            }
                            onClick={() => removeOneMutation.mutate(ed.id)}
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      isLoading={clearAllMutation.isPending}
                      onClick={() => clearAllMutation.mutate()}
                    >
                      Clear all
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No discounts on this enrollment yet.
                  </p>
                )}

                <div className="space-y-2">
                  <p className="text-sm font-medium">Add discount</p>
                  <Select
                    items={selectItems}
                    value={
                      discountId != null ? String(discountId) : NONE_VALUE
                    }
                    onValueChange={(v) =>
                      setDiscountId(
                        v === NONE_VALUE || !v ? undefined : Number(v),
                      )
                    }
                    placeholder="Select discount to add"
                    disabled={eligibleQuery.isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor={`reason-${userCourseId}`}>
                    Reason (optional)
                  </label>
                  <Input
                    id={`reason-${userCourseId}`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. sibling discount"
                  />
                </div>
                {previewQuery.data?.length ? (
                  <div className="rounded-md border p-3 text-sm space-y-1">
                    <p className="font-medium">Next invoice preview</p>
                    {previewQuery.data.slice(0, 3).map((period) => (
                      <p key={period.index} className="text-muted-foreground">
                        Period {period.index + 1}: {period.invoiced_amount}{" "}
                        {period.currency}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  onClick={() => addMutation.mutate()}
                  isLoading={addMutation.isPending}
                  disabled={!discountId}
                >
                  Add
                </Button>
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}
    </div>
  );
}
