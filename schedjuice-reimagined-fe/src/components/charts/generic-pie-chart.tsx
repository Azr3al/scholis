"use client";

import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/charts/chart";
import { roundNumber } from "@/helpers/number";
import { useMemo } from "react";
import { Cell, Pie, PieChart } from "recharts";

interface GenericPieChartProps {
  chartConfig: ChartConfig;
  chartData: any[];
  title: string;
  description: string;
  dataKey?: "count" | "amount";
  tooltipFormatter?: (value: number, entry: any) => string;
  emptyMessage?: string;
  showLegend?: boolean;
  showSliceLabels?: boolean;
}

const DEFAULT_EMPTY_MESSAGE = "No data for this period.";

function hasPieChartData(
  chartData: GenericPieChartProps["chartData"],
  dataKey: NonNullable<GenericPieChartProps["dataKey"]>,
): boolean {
  if (!chartData.length) return false;
  return chartData.some((entry) => Number(entry[dataKey]) > 0);
}

function buildLegendChartConfig(
  chartConfig: ChartConfig,
  chartData: GenericPieChartProps["chartData"],
  dataKey: NonNullable<GenericPieChartProps["dataKey"]>,
): ChartConfig {
  const total = chartData.reduce((sum, entry) => sum + Number(entry[dataKey]), 0);
  const enriched: ChartConfig = { ...chartConfig };

  for (const entry of chartData) {
    const category = entry.category ?? entry.name;
    if (category == null) continue;

    const pct =
      total > 0 ? roundNumber((Number(entry[dataKey]) / total) * 100) : 0;
    const existing = enriched[category];
    const displayName = existing?.label ?? category;

    enriched[category] = {
      ...existing,
      label: `${displayName} (${pct}%)`,
    };
  }

  return enriched;
}

export const GenericPieChart: React.FC<GenericPieChartProps> = ({
  chartConfig,
  chartData,
  title,
  description,
  dataKey = "count",
  tooltipFormatter,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  showLegend = true,
  showSliceLabels = false,
}) => {
  const hasData = hasPieChartData(chartData, dataKey);
  const legendChartConfig = useMemo(
    () => buildLegendChartConfig(chartConfig, chartData, dataKey),
    [chartConfig, chartData, dataKey],
  );

  return (
    <div className="flex min-h-[320px] flex-col">
      <div className="items-center pb-0">
        <h3 className="text-base font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {hasData ? (
        <div className="flex-1 pb-0">
          <ChartContainer
            config={legendChartConfig}
            className="mx-auto aspect-square max-h-[500px] pb-0"
          >
            <PieChart
              margin={{
                top: 8,
                left: 8,
                right: 8,
                bottom: showLegend ? 8 : 16,
              }}
            >
              <ChartTooltip
                cursor={true}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, _name, item) => {
                      if (tooltipFormatter) {
                        return tooltipFormatter(Number(value), item?.payload);
                      }
                      return String(value);
                    }}
                  />
                }
              />
              {showLegend ? (
                <ChartLegend
                  content={
                    <ChartLegendContent
                      nameKey="category"
                      className="flex-wrap justify-center gap-x-4 gap-y-2 pt-3"
                    />
                  }
                />
              ) : null}
              <Pie
                data={chartData}
                dataKey={dataKey}
                label={
                  showSliceLabels
                    ? (v) => `${roundNumber(v.percent * 100)}%`
                    : false
                }
                nameKey="category"
              >
                {chartData.map((entry, index) => {
                  const category = entry.category ?? entry.name;
                  const configColor =
                    category != null
                      ? chartConfig[category]?.color
                      : undefined;
                  const fill =
                    entry.fill ??
                    configColor ??
                    `var(--chart-${(index % 5) + 1})`;
                  return (
                    <Cell
                      key={category ?? index}
                      fill={fill}
                    />
                  );
                })}
              </Pie>
            </PieChart>
          </ChartContainer>
        </div>
      ) : (
        <div className="flex min-h-[280px] flex-1 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/20">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      )}
    </div>
  );
};
