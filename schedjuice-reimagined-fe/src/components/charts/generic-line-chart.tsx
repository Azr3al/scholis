import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/charts/chart";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

interface GenericLineChartProps {
  chartConfig: ChartConfig;
  chartData: any[];
  title: string;
  description: string;
  xDataKey?: string;
  yDataKey?: string;
}

const GenericLineChart: React.FC<GenericLineChartProps> = ({
  chartConfig,
  chartData,
  xDataKey = "x",
  yDataKey = "y",
  title,
  description,
}) => {
  return (
    <div>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div>
        <ChartContainer config={chartConfig}>
          <AreaChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 12,
              right: 12,
              top: 12,
              bottom: 25,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey={xDataKey}
              tickLine={false}
              axisLine={false}
              tickMargin={0}
              angle={-40}
              textAnchor="end"
              overflow={"visible"}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Area
              dataKey={yDataKey}
              type="linear"
              fill="var(--color-desktop)"
              fillOpacity={0.4}
              stroke="var(--color-desktop)"
              label={(v: any) => {
                if (v.value === 0) {
                  return null;
                }
                return (
                  <text
                    x={v.x}
                    y={v.y}
                    dy={-16}
                    fontSize={12}
                    textAnchor="middle"
                  >
                    {v.value}
                  </text>
                );
              }}
              activeDot={{
                r: 6,
              }}
            ></Area>
          </AreaChart>
        </ChartContainer>
      </div>
      <div></div>
    </div>
  );
};

export default GenericLineChart;
