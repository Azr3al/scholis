"use client";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/org/ai/charts/chart";
import type {
  AiUsageAnalyticsOutcomeTotals,
} from "@/types/ai-usage-analytics";
import type { RequestsOutcomeFilter } from "@/types/ai-usage";
import { Cell, Pie, PieChart } from "recharts";

const OUTCOME_META: {
  key: keyof AiUsageAnalyticsOutcomeTotals;
  label: string;
  filter: RequestsOutcomeFilter;
  color: string;
}[] = [
  { key: "success", label: "Success", filter: "success", color: "var(--chart-1)" },
  {
    key: "capability_gap",
    label: "Capability gap",
    filter: "capability_gap",
    color: "var(--chart-2)",
  },
  {
    key: "tool_limit_exceeded",
    label: "Tool limit",
    filter: "tool_limit_exceeded",
    color: "var(--chart-3)",
  },
  { key: "error", label: "Error", filter: "error", color: "var(--chart-4)" },
  { key: "blocked", label: "Blocked", filter: "blocked", color: "var(--chart-5)" },
  {
    key: "rate_limited",
    label: "Rate limited",
    filter: "rate_limited",
    color: "hsl(var(--muted-foreground))",
  },
];

const chartConfig = OUTCOME_META.reduce(
  (acc, item) => {
    acc[item.key] = {
      label: item.label,
      theme: { light: item.color, dark: item.color },
    };
    return acc;
  },
  {} as ChartConfig,
);

export function OutcomeMixChart({
  totals,
  onOutcomeSelect,
}: {
  totals: AiUsageAnalyticsOutcomeTotals;
  onOutcomeSelect?: (outcome: RequestsOutcomeFilter) => void;
}) {
  const total = OUTCOME_META.reduce((sum, item) => sum + totals[item.key], 0);
  if (total === 0) {
    return (
      <p className="flex h-[min(280px,40vh)] items-center justify-center text-sm text-muted-foreground">
        No AI activity for this month
      </p>
    );
  }

  const data = OUTCOME_META.filter((item) => totals[item.key] > 0).map((item) => ({
    key: item.key,
    name: item.label,
    value: totals[item.key],
    filter: item.filter,
    fill: item.color,
  }));

  const successRate = Math.round((totals.success / total) * 100);

  return (
    <div className="relative">
      <ChartContainer config={chartConfig} className="h-[min(280px,40vh)] w-full aspect-auto">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            onClick={(_, index) => {
              if (!onOutcomeSelect) return;
              onOutcomeSelect(data[index]?.filter ?? "all");
            }}
            className={onOutcomeSelect ? "cursor-pointer" : undefined}
          >
            {data.map((entry) => (
              <Cell key={entry.key} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-2xl font-semibold tabular-nums">{total}</p>
        <p className="text-xs text-muted-foreground">requests · {successRate}% success</p>
      </div>
    </div>
  );
}
