"use client";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/org/ai/charts/chart";
import type { AiUsageAnalyticsMonthlyTrend } from "@/types/ai-usage-analytics";
import { formatAiUsd } from "@/types/ai-usage";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

const chartConfig = {
  request_count: {
    label: "Requests",
    theme: { light: "var(--chart-1)", dark: "var(--chart-1)" },
  },
  success_rate_pct: {
    label: "Success rate",
    theme: { light: "var(--chart-2)", dark: "var(--chart-2)" },
  },
  total_cost_num: {
    label: "Cost",
    theme: { light: "var(--chart-3)", dark: "var(--chart-3)" },
  },
} satisfies ChartConfig;

function hasActivity(trend: AiUsageAnalyticsMonthlyTrend[]) {
  return trend.some(
    (row) => row.request_count > 0 || Number(row.total_cost_usd) > 0,
  );
}

export function MonthlyTrendChart({
  trend,
}: {
  trend: AiUsageAnalyticsMonthlyTrend[];
}) {
  if (!hasActivity(trend)) {
    return (
      <p className="flex h-[min(280px,40vh)] items-center justify-center text-sm text-muted-foreground">
        No AI activity for this month
      </p>
    );
  }

  const data = trend.map((row) => ({
    ...row,
    label: `${row.month}/${row.year}`,
    success_rate_pct: row.success_rate * 100,
    total_cost_num: Number(row.total_cost_usd),
  }));

  return (
    <ChartContainer config={chartConfig} className="h-[min(280px,40vh)] w-full aspect-auto">
      <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis yAxisId="left" tickLine={false} axisLine={false} width={32} />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, 100]}
          tickLine={false}
          axisLine={false}
          width={36}
          tickFormatter={(value) => `${value}%`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => {
                if (name === "total_cost_num") return formatAiUsd(Number(value));
                if (name === "success_rate_pct") return `${Number(value).toFixed(1)}%`;
                return String(value);
              }}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="request_count"
          stroke="var(--color-request_count)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="success_rate_pct"
          stroke="var(--color-success_rate_pct)"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={false}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="total_cost_num"
          stroke="var(--color-total_cost_num)"
          strokeWidth={2}
          strokeDasharray="2 3"
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
