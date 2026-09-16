"use client";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/charts/chart";
import { formatDecimalString } from "@/helpers/money";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

type FinanceCollectionsLineChartProps = {
  current: { date: string; amount: string }[];
  currencySymbol: string;
  title?: string;
  description?: string;
};

const chartConfig = {
  current: { label: "Current", color: "var(--chart-1)" },
} satisfies ChartConfig;

const CHART_EMPTY_MESSAGE = "No data for this period.";

function hasChartData(current: FinanceCollectionsLineChartProps["current"]): boolean {
  if (current.length === 0) return false;
  return current.some((point) => Number(point.amount) !== 0);
}

function toChartData(current: FinanceCollectionsLineChartProps["current"]) {
  return current.map((point) => ({
    date: point.date.slice(5),
    current: Number(point.amount),
  }));
}

export function FinanceCollectionsLineChart({
  current,
  currencySymbol,
  title = "Daily collections",
  description,
}: FinanceCollectionsLineChartProps) {
  const data = toChartData(current);
  const hasData = hasChartData(current);

  return (
    <div className="flex min-h-[320px] flex-col gap-2">
      <div>
        <h3 className="text-base font-medium">{title}</h3>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {hasData ? (
        <ChartContainer config={chartConfig} className="min-h-[280px] w-full">
          <AreaChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 24 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              angle={-35}
              textAnchor="end"
              height={50}
            />
            <YAxis tickLine={false} axisLine={false} width={56} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => [
                    formatDecimalString(String(value), currencySymbol),
                    "Current",
                  ]}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="current"
              stroke="var(--color-current)"
              fill="var(--color-current)"
              fillOpacity={0.25}
              strokeWidth={2}
              name="Current"
            />
          </AreaChart>
        </ChartContainer>
      ) : (
        <div className="flex min-h-[280px] flex-1 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/20">
          <p className="text-sm text-muted-foreground">{CHART_EMPTY_MESSAGE}</p>
        </div>
      )}
    </div>
  );
}
