"use client";
import { Button, Field, Input } from "@/components/primitives";

import { fetchOrgBilling } from "@/app/client-api/billing";
import {
  fetchPlatformBillingConfig,
  patchPlatformBillingConfig,
} from "@/app/client-api/platform-billing-config";
import {
  fetchPlatformInvoices,
  generatePlatformInvoice,
} from "@/app/client-api/platform-invoice";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/_chrome/card";
import { Table, column, type Column } from "@/components/data-table";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import { formatDate, getDateISOString } from "@/helpers/date";
import { downloadPlatformInvoicePdf } from "@/helpers/platform-invoice";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { formatMoney, DEFAULT_TENANT_CURRENCY_SYMBOL } from "@/helpers/money";
import type { BillingResponse, BillingRow } from "@/types/billing";
import { formatAiUsd } from "@/types/ai-usage";
import {
  formatInvoicePeriod,
  invoiceExistsForPeriod,
  type PlatformInvoice,
} from "@/types/platform-invoice";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsIsoDateTime, useQueryState } from "nuqs";
import { useEffect, useMemo, useState } from "react";
import { OrgSectionPanel } from "./org-section-panel";

function formatMonthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function perDayAmount(row: BillingRow): number {
  return row.active_user_count * row.cost_per_account_at_creation;
}

export function OrgBillingSection({
  orgId,
  currencySymbol,
  enablePlatformInvoices = false,
  organizationName,
}: {
  orgId: string | number;
  currencySymbol?: string;
  enablePlatformInvoices?: boolean;
  organizationName?: string;
}) {
  const queryClient = useQueryClient();
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [flatRateDraft, setFlatRateDraft] = useState("");
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const [date, setDate] = useQueryState(
    "date",
    parseAsIsoDateTime.withDefault(new Date()),
  );
  const monthDate = useMemo(
    () => new Date(date.getFullYear(), date.getMonth(), 1),
    [date],
  );
  const billingYear = monthDate.getFullYear();
  const billingMonth = monthDate.getMonth() + 1;
  const dateParam = getDateISOString(date);
  const displayCurrency =
    currencySymbol ?? DEFAULT_TENANT_CURRENCY_SYMBOL;

  const billingQuery = useQuery<BillingResponse>({
    queryKey: ["billing", orgId, dateParam],
    queryFn: () => fetchOrgBilling(orgId, dateParam),
    enabled: !!orgId && !!dateParam,
  });

  const invoicesQuery = useQuery({
    queryKey: ["platformInvoices", orgId],
    queryFn: async () => {
      const res = await fetchPlatformInvoices(orgId);
      if (res.isError) {
        throw new Error(res.message || "Failed to load invoices");
      }
      return res.data;
    },
    enabled: enablePlatformInvoices && !!orgId,
  });

  const billingConfigQuery = useQuery({
    queryKey: ["platformBillingConfig", orgId],
    queryFn: () => fetchPlatformBillingConfig(orgId),
    enabled: enablePlatformInvoices && !!orgId,
  });

  useEffect(() => {
    if (billingConfigQuery.data) {
      const rate = billingConfigQuery.data.platform_monthly_flat_rate;
      setFlatRateDraft(rate != null ? String(rate) : "");
    }
  }, [billingConfigQuery.data]);

  const saveFlatRateMutation = useMutation({
    mutationFn: async () => {
      const trimmed = flatRateDraft.trim();
      const value = trimmed === "" ? null : Number(trimmed);
      if (value != null && (!Number.isInteger(value) || value < 0)) {
        throw new Error("Enter a whole number zero or greater, or leave blank.");
      }
      return patchPlatformBillingConfig(orgId, {
        platform_monthly_flat_rate: value,
      });
    },
    onMutate: () => setConfigError(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformBillingConfig", orgId] });
    },
    onError: (error: unknown) => {
      setConfigError(parseSchedjuiceApiError(error, "Failed to save flat rate"));
    },
  });

  const hasInvoiceForMonth = invoiceExistsForPeriod(
    invoicesQuery.data,
    billingYear,
    billingMonth,
  );

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await generatePlatformInvoice(orgId, billingYear, billingMonth);
      if (res.isError) {
        throw new Error(res.message || "Failed to generate invoice");
      }
      await downloadPlatformInvoicePdf(res.data);
      return res.data;
    },
    onMutate: () => setGenerateError(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platformInvoices", orgId] });
    },
    onError: (error: unknown) => {
      setGenerateError(
        parseSchedjuiceApiError(error, "Failed to generate invoice"),
      );
    },
  });

  const columns = useMemo((): Column<BillingRow>[] => {
    return [
      column.text<BillingRow>({
        id: "date",
        header: "Date",
        accessor: (row) => formatDate(row.billing_date),
        enableSorting: false,
        sizing: { role: "date" },
      }),
      column.numeric<BillingRow>({
        id: "active_users",
        header: "Active users",
        accessor: (row) => row.active_user_count,
        enableSorting: false,
      }),
      {
        id: "cost_per_account",
        header: "Cost per account",
        accessor: (row) => row.cost_per_account_at_creation,
        align: "right",
        sizing: { role: "numeric", tabular: true },
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {formatMoney(row.cost_per_account_at_creation, displayCurrency)}
          </span>
        ),
      },
      {
        id: "per_day_amount",
        header: "Per-day amount",
        accessor: (row) => perDayAmount(row),
        align: "right",
        sizing: { role: "numeric", tabular: true },
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {formatMoney(perDayAmount(row), displayCurrency)}
          </span>
        ),
      },
    ];
  }, [displayCurrency]);

  const invoiceColumns = useMemo((): Column<PlatformInvoice>[] => {
    return [
      column.numeric<PlatformInvoice>({
        id: "invoice_number",
        header: "Invoice #",
        accessor: (row) => row.invoice_number,
        enableSorting: false,
      }),
      column.text<PlatformInvoice>({
        id: "period",
        header: "Period",
        accessor: (row) =>
          formatInvoicePeriod(row.billing_year, row.billing_month),
        enableSorting: false,
      }),
      {
        id: "platform_subtotal",
        header: "Usage",
        accessor: (row) => row.totals.platform_subtotal,
        align: "right",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {row.totals.platform_subtotal > 0
              ? formatMoney(row.totals.platform_subtotal, displayCurrency)
              : "—"}
          </span>
        ),
      },
      {
        id: "flat_rate_subtotal",
        header: "Flat rate",
        accessor: (row) => row.totals.flat_rate_subtotal ?? 0,
        align: "right",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {row.totals.flat_rate_subtotal
              ? formatMoney(row.totals.flat_rate_subtotal, displayCurrency)
              : "—"}
          </span>
        ),
      },
      {
        id: "ai_subtotal",
        header: "AI (USD)",
        accessor: (row) => row.totals.ai_subtotal_usd ?? "",
        align: "right",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {row.totals.ai_subtotal_usd
              ? formatAiUsd(row.totals.ai_subtotal_usd)
              : "—"}
          </span>
        ),
      },
      column.text<PlatformInvoice>({
        id: "generated_at",
        header: "Generated",
        accessor: (row) => formatDate(row.generated_at),
        enableSorting: false,
        sizing: { role: "date" },
      }),
      {
        id: "actions",
        header: "",
        accessor: () => "",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            variant="secondary"
            size="sm"
            isLoading={downloadingId === row.id}
            disabled={downloadingId != null && downloadingId !== row.id}
            onClick={async () => {
              setDownloadingId(row.id);
              try {
                await downloadPlatformInvoicePdf(row);
              } finally {
                setDownloadingId(null);
              }
            }}
          >
            Download PDF
          </Button>
        ),
      },
    ];
  }, [displayCurrency, downloadingId]);

  const canGenerate = enablePlatformInvoices && !generateMutation.isPending;

  return (
    <OrgSectionPanel
      title="Billing"
      description="Aggregated billing for the selected month."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-end gap-3">
          <YearMonthSelector
            date={monthDate}
            setDate={setDate}
            label="Month"
            layout="toolbar"
          />
          {enablePlatformInvoices ? (
            <Button
              variant="primary"
              size="sm"
              isLoading={generateMutation.isPending}
              disabled={!canGenerate && !generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              {hasInvoiceForMonth ? "Regenerate invoice" : "Generate invoice"}
            </Button>
          ) : null}
        </div>

        {generateError ? (
          <p className="text-sm text-destructive">{generateError}</p>
        ) : null}
        {enablePlatformInvoices && organizationName ? (
          <p className="text-sm text-text-muted">Tenant: {organizationName}</p>
        ) : null}

        {enablePlatformInvoices ? (
          <Card className="max-w-md" aria-busy={billingConfigQuery.isLoading}>
            <CardHeader>
              <CardTitle className="text-base">Monthly flat rate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-text-muted">
                When set, invoices bill this subscription amount instead of
                per-user usage for the month.
              </p>
              <Field.Root>
                <Field.Label htmlFor="platform-flat-rate">
                  Amount per month ({displayCurrency})
                </Field.Label>
                <Input
                  id="platform-flat-rate"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={flatRateDraft}
                  onChange={(event) => setFlatRateDraft(event.target.value)}
                  disabled={
                    billingConfigQuery.isLoading || saveFlatRateMutation.isPending
                  }
                  placeholder="Leave blank for usage-only billing"
                />
              </Field.Root>
              {billingConfigQuery.data?.cost_per_account_per_day != null ? (
                <p className="text-xs text-text-muted">
                  Usage rate:{" "}
                  {formatMoney(
                    billingConfigQuery.data.cost_per_account_per_day,
                    displayCurrency,
                  )}{" "}
                  per active user per day
                </p>
              ) : null}
              {configError ? (
                <p className="text-sm text-destructive">{configError}</p>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                isLoading={saveFlatRateMutation.isPending}
                disabled={billingConfigQuery.isLoading}
                onClick={() => saveFlatRateMutation.mutate()}
              >
                Save flat rate
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {billingQuery.isLoading ? (
          <TableSkeleton columns={4} rows={8} />
        ) : billingQuery.isError ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">
              Failed to load billing data. Please try again.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => billingQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : billingQuery.data ? (
          <div className="space-y-6">
            <Card className="max-w-sm">
              <CardHeader>
                <CardTitle className="text-base">Total payment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-2xl font-semibold tabular-nums">
                  {formatMoney(
                    billingQuery.data.isError
                      ? 0
                      : (billingQuery.data.total_payment ?? 0),
                    displayCurrency,
                  )}
                </p>
                <p className="text-sm text-text-muted">
                  {formatMonthLabel(billingYear, billingMonth)}
                </p>
              </CardContent>
            </Card>
            {billingQuery.data.data.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-muted">
                No billing records for this month.
              </p>
            ) : (
              <div className="min-w-0 overflow-x-auto">
                <Table
                  columns={columns}
                  rows={billingQuery.data.data}
                  getRowId={(row) => String(row.id)}
                  bodyMinHeightClassName="min-h-0"
                />
              </div>
            )}
          </div>
        ) : null}

        {enablePlatformInvoices ? (
          <section className="space-y-4" aria-busy={invoicesQuery.isLoading}>
            <div>
              <h3 className="text-base font-semibold">Invoice history</h3>
              <p className="text-sm text-text-muted">
                Issued platform invoices for this tenant.
              </p>
            </div>
            {invoicesQuery.isLoading ? (
              <TableSkeleton columns={7} rows={4} />
            ) : invoicesQuery.isError ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
                <p className="text-sm text-destructive">
                  Failed to load invoice history.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => invoicesQuery.refetch()}
                >
                  Retry
                </Button>
              </div>
            ) : invoicesQuery.data && invoicesQuery.data.length > 0 ? (
              <div className="min-w-0 overflow-x-auto">
                <Table
                  columns={invoiceColumns}
                  rows={invoicesQuery.data}
                  getRowId={(row) => String(row.id)}
                  bodyMinHeightClassName="min-h-0"
                />
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-text-muted">
                No invoices yet.
              </p>
            )}
          </section>
        ) : null}
      </div>
    </OrgSectionPanel>
  );
}
