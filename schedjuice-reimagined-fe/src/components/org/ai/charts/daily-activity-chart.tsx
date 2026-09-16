"use client";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/org/ai/charts/chart";
import type { AiUsageAnalyticsDaily } from "@/types/ai-usage-analytics";
import { formatAiUsd } from "@/types/ai-usage";
import { format, parseISO } from "date-fns";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";

const chartConfig = {
  request_count: {
    label: "Requests",
    theme: { light: "var(--chart-1)", dark: "var(--chart-1)" },
  },
  total_cost_usd: {
    label: "Cost",
    theme: { light: "var(--chart-2)", dark: "var(--chart-2)" },
  },
} satisfies ChartConfig;

function hasActivity(daily: AiUsageAnalyticsDaily[]) {
  return daily.some((row) => row.request_count > 0);
}

export function DailyActivityChart({ daily }: { daily: AiUsageAnalyticsDaily[] }) {
  if (!hasActivity(daily)) {
    return (
      <p className="flex h-[min(280px,40vh)] items-center justify-center text-sm text-muted-foreground">
        No AI activity for this month
      </p>
    );
  }

  const data = daily.map((row) => ({
    ...row,
    total_cost_num: Number(row.total_cost_usd),
    label: format(parseISO(row.date), "d MMM"),
  }));

  return (
    <ChartContainer config={chartConfig} className="h-[min(280px,40vh)] w-full aspect-auto">
      <ComposedChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis yAxisId="left" tickLine={false} axisLine={false} width={32} />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(value) => formatAiUsd(value)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name, item) => {
                if (name === "total_cost_num") {
                  return formatAiUsd(Number(value));
                }
                const payload = item.payload as AiUsageAnalyticsDaily;
                if (name === "request_count") {
                  return `${value} (${payload.success_count} success)`;
                }
                return String(value);
              }}
            />
          }
        />
        <Bar
          yAxisId="left"
          dataKey="request_count"
          fill="var(--color-request_count)"
          radius={[2, 2, 0, 0]}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="total_cost_num"
          stroke="var(--color-total_cost_usd)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
