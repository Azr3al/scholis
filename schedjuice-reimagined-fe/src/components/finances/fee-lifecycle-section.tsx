"use client";

import { SankeyDiagram, type SankeyLinkInput, type SankeyNodeInput } from "@/components/charts/sankey-diagram";
import { Select } from "@/components/primitives";
import { formatDecimalString } from "@/helpers/money";
import { useFeeLifecycle } from "@/hooks/finances/use-fee-lifecycle";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import type {
  FeeLifecycleBreakdown,
  FeeLifecycleFilterState,
  FeeLifecycleLink,
  FeeLifecycleNode,
} from "@/types/finance/fee-lifecycle";
import { useMemo, useState } from "react";

export const FEE_LIFECYCLE_NODE_COLORS: Record<string, string> = {
  billed: "var(--foreground)",
  discounts_given: "#d97706",
  net_invoiced: "var(--foreground)",
  collected: "#059669",
  in_verification: "#2563eb",
  awaiting_payment: "var(--muted-foreground)",
  stuck: "#dc2626",
  refunded: "#dc2626",
  retained: "#059669",
};

const BREAKDOWN_ITEMS: { value: FeeLifecycleBreakdown; label: string }[] = [
  { value: "none", label: "None" },
  { value: "payment_method", label: "Payment method" },
  { value: "bank", label: "Bank" },
];

function nodeColor(node: SankeyNodeInput): string {
  return FEE_LIFECYCLE_NODE_COLORS[node.key] ?? "var(--muted-foreground)";
}

function toChartNodes(nodes: FeeLifecycleNode[]): SankeyNodeInput[] {
  return nodes.map((node) => ({
    key: node.key,
    label: node.label,
    amount: node.amount,
    isEstimated: node.is_estimated,
  }));
}

function toChartLinks(links: FeeLifecycleLink[]): SankeyLinkInput[] {
  return links.map((link) => ({
    source: link.source,
    target: link.target,
    amount: link.amount,
    isEstimated: link.is_estimated,
  }));
}

export function FeeLifecycleSection({
  filterState,
}: {
  filterState: Omit<FeeLifecycleFilterState, "breakdown">;
}) {
  const { canAny } = usePermissions();
  const allowed = canAny(["payment.view_all", "analytics.view"]);
  const [breakdown, setBreakdown] = useState<FeeLifecycleBreakdown>("none");
  const currencySymbol = useTenantCurrencySymbol();
  const query = useFeeLifecycle(
    { ...filterState, breakdown },
    { enabled: allowed },
  );

  const payload = query.data;
  const chartNodes = useMemo(
    () => toChartNodes(payload?.nodes ?? []),
    [payload?.nodes],
  );
  const chartLinks = useMemo(
    () => toChartLinks(payload?.links ?? []),
    [payload?.links],
  );

  if (!allowed) return null;

  const isEmpty =
    (payload?.nodes.length ?? 0) === 0 && (payload?.links.length ?? 0) === 0;
  const unattributedCount = payload?.unattributed.payment_count ?? 0;

  return (
    <div className="flex min-h-[320px] flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-medium">Fee lifecycle</h3>
          <p className="text-sm text-muted-foreground">
            {payload?.meta.period_label ?? filterState.period}
            {" · "}
            Amounts follow the same payment dates as Cash received, not billing coverage.
          </p>
        </div>
        <Select
          aria-label="Break down by"
          value={breakdown}
          onValueChange={(value) =>
            setBreakdown(value as FeeLifecycleBreakdown)
          }
          items={BREAKDOWN_ITEMS}
        />
      </div>
      {query.isError ? (
        <p className="text-sm text-destructive">
          Failed to load fee lifecycle.
        </p>
      ) : isEmpty && !query.isLoading ? (
        <div className="flex min-h-[280px] flex-1 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/20">
          <p className="text-sm text-muted-foreground">
            No billed fees for this period.
          </p>
        </div>
      ) : (
        <SankeyDiagram
          nodes={chartNodes}
          links={chartLinks}
          formatAmount={(amount) => formatDecimalString(amount, currencySymbol)}
          nodeColor={nodeColor}
          emptyMessage="No billed fees for this period."
          tooltipContent={({ kind, node, link }) => {
            if (kind === "node" && node) {
              const extra =
                node.key === "collected" && payload?.meta.cash_received
                  ? ` · cash received ${formatDecimalString(payload.meta.cash_received, currencySymbol)}`
                  : node.key === "refunded" && payload?.meta.refund_clamped
                    ? " · refunds clamped to collected"
                    : "";
              return `${node.label}: ${formatDecimalString(node.amount, currencySymbol)}${extra}`;
            }
            if (link) {
              return `${link.source} → ${link.target}: ${formatDecimalString(link.amount, currencySymbol)}`;
            }
            return null;
          }}
        />
      )}
      {unattributedCount > 0 ? (
        <p className="text-sm text-amber-700">
          Unattributed:{" "}
          {formatDecimalString(payload?.unattributed.amount, currencySymbol)} ·{" "}
          {unattributedCount} payments have no billing period.
        </p>
      ) : null}
    </div>
  );
}
