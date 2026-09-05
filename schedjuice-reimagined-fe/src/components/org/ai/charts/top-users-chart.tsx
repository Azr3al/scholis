"use client";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/org/ai/charts/chart";
import type { AiUsageAnalyticsTopUser } from "@/types/ai-usage-analytics";
import { formatAiTokens, formatAiUsd } from "@/types/ai-usage";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

const chartConfig = {
  request_count: {
    label: "Requests",
    theme: { light: "var(--chart-1)", dark: "var(--chart-1)" },
  },
} satisfies ChartConfig;

export function TopUsersChart({ users }: { users: AiUsageAnalyticsTopUser[] }) {
  if (users.length === 0) {
    return (
      <p className="flex h-[min(280px,40vh)] items-center justify-center text-sm text-muted-foreground">
        No AI activity for this month
      </p>
    );
  }

  const data = users.map((user) => ({
    ...user,
    label:
      user.display_name.length > 18
        ? `${user.display_name.slice(0, 16)}…`
        : user.display_name,
  }));

  return (
    <ChartContainer config={chartConfig} className="h-[min(280px,40vh)] w-full aspect-auto">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
      >
        <XAxis type="number" tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={96}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as AiUsageAnalyticsTopUser | undefined;
                if (!row) return "";
                return row.email ? `${row.display_name} · ${row.email}` : row.display_name;
              }}
              formatter={(value, _name, item) => {
                const row = item.payload as AiUsageAnalyticsTopUser;
                return [
                  `${value} requests · ${formatAiUsd(row.total_cost_usd)} · ${formatAiTokens(row.total_tokens)} tokens`,
                  "Usage",
                ];
              }}
            />
          }
        />
        <Bar
          dataKey="request_count"
          fill="var(--color-request_count)"
          radius={[0, 2, 2, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}
