"use client";

import { Spinner } from "@/components/primitives/spinner";
import { PageContainer } from "@/components/layout/page-container";
import { axiosClient } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { StatsReport as FileSearch } from "iconoir-react";

type OcrAnalyticsResponse = {
  isError?: boolean;
  data?: {
    month: string;
    vendor: {
      available: boolean;
      total?: number;
      engine1?: number;
      engine2?: number;
      quota?: number | null;
      quota_percent?: number | null;
      period_through?: string;
      error?: string;
    };
    summary: {
      total: number;
      errors: number;
      correct: number;
      corrected: number;
      pending: number;
      failed_extraction: number;
    };
    by_source: {
      source: string;
      total: number;
      correct: number;
      corrected: number;
      errors: number;
    }[];
    by_tenant: {
      tenant_id: number;
      tenant__name: string;
      total: number;
      correct: number;
    }[];
    daily: { day: string; total: number }[];
  };
};

async function fetchOcrAnalytics(): Promise<OcrAnalyticsResponse["data"]> {
  const { data } = await axiosClient.get<OcrAnalyticsResponse>(
    "management/ocr-analytics",
  );
  if (data.isError) {
    throw new Error("Failed to load OCR analytics");
  }
  return data.data;
}

function pct(n: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((n / total) * 1000) / 10}%`;
}

export default function InternalOcrAnalyticsPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["ocr-analytics"],
    queryFn: fetchOcrAnalytics,
  });

  return (
    <PageContainer width="wide" className="font-mono text-sm min-h-[70vh]">
      <div className="border-b border-border pb-4 mb-6">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <FileSearch className="h-4 w-4" />
          <span>SUPERADMIN TOOLS</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">OCR Analytics</h1>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              OCR.space vendor quota and app-side extraction events for{" "}
              {data?.month ?? "this month"}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="text-xs underline text-muted-foreground disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Spinner className="h-4 w-4" /> Loading analytics…
        </div>
      ) : error || !data ? (
        <p className="text-destructive text-xs">Could not load OCR analytics.</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border border-border p-4">
              <span className="font-medium">Vendor quota (OCR.space)</span>
              {data.vendor.available ? (
                <div className="mt-2 space-y-1 text-xs">
                  <p>
                    Total: {data.vendor.total?.toLocaleString() ?? "—"}
                    {data.vendor.quota
                      ? ` / ${data.vendor.quota.toLocaleString()} (${data.vendor.quota_percent ?? "—"}%)`
                      : null}
                  </p>
                  <p>
                    Engine 1: {data.vendor.engine1?.toLocaleString() ?? "—"} · Engine
                    2: {data.vendor.engine2?.toLocaleString() ?? "—"}
                  </p>
                  {data.vendor.period_through ? (
                    <p className="text-muted-foreground">
                      Through {data.vendor.period_through}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  {data.vendor.error ?? "Vendor quota unavailable"}
                </p>
              )}
            </div>
            <div className="border border-border p-4">
              <span className="font-medium">App usage</span>
              <div className="mt-2 space-y-1 text-xs">
                <p>Calls: {data.summary.total}</p>
                <p>
                  Correct: {data.summary.correct} ({pct(data.summary.correct, data.summary.total)})
                </p>
                <p>
                  Corrected: {data.summary.corrected} (
                  {pct(data.summary.corrected, data.summary.total)})
                </p>
                <p>Pending: {data.summary.pending}</p>
                <p>Errors: {data.summary.errors}</p>
              </div>
            </div>
          </div>

          <div className="border border-border p-4">
            <span className="font-medium">By source</span>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-1 pr-4">Source</th>
                    <th className="py-1 pr-4">Total</th>
                    <th className="py-1 pr-4">Correct</th>
                    <th className="py-1 pr-4">Corrected</th>
                    <th className="py-1">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_source.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-2 text-muted-foreground">
                        No events this month.
                      </td>
                    </tr>
                  ) : (
                    data.by_source.map((row) => (
                      <tr key={row.source} className="border-b border-border/60">
                        <td className="py-1.5 pr-4">{row.source}</td>
                        <td className="py-1.5 pr-4">{row.total}</td>
                        <td className="py-1.5 pr-4">
                          {row.correct} ({pct(row.correct, row.total)})
                        </td>
                        <td className="py-1.5 pr-4">
                          {row.corrected} ({pct(row.corrected, row.total)})
                        </td>
                        <td className="py-1.5">{row.errors}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border border-border p-4">
            <span className="font-medium">Top tenants</span>
            <div className="mt-3 space-y-1 text-xs">
              {data.by_tenant.length === 0 ? (
                <p className="text-muted-foreground">No tenant breakdown yet.</p>
              ) : (
                data.by_tenant.map((row) => (
                  <div
                    key={row.tenant_id}
                    className="flex justify-between border-b border-border/40 py-1"
                  >
                    <span>{row.tenant__name}</span>
                    <span className="text-muted-foreground">
                      {row.total} calls · {row.correct} correct
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
