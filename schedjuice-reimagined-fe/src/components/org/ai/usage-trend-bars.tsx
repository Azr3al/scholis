import type { AiUsageTrendPoint } from "@/types/ai-usage";
import { formatAiUsd, formatCacheHitRate } from "@/types/ai-usage";

type UsageTrendBarsProps = {
  trend: AiUsageTrendPoint[];
  className?: string;
};

export function UsageTrendBars({ trend, className }: UsageTrendBarsProps) {
  const maxCost = Math.max(
    ...trend.map((point) => Number(point.total_cost_usd)),
    0,
  );
  const maxSavings = Math.max(
    ...trend.map((point) => Number(point.cache_savings_usd)),
    0,
  );

  return (
    <div className={className}>
      <div className="flex h-8 items-end gap-1">
        {trend.map((point) => {
          const cost = Number(point.total_cost_usd);
          const heightPct = maxCost > 0 ? Math.max((cost / maxCost) * 100, 4) : 4;
          return (
            <div
              key={`${point.year}-${point.month}`}
              className="group flex flex-1 flex-col items-center gap-1"
              title={`${point.month}/${point.year}: ${formatAiUsd(cost)}`}
            >
              <div
                className="w-full rounded-sm bg-primary/70 transition-colors group-hover:bg-primary"
                style={{ height: `${heightPct}%`, minHeight: "4px" }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex h-6 items-end gap-1">
        {trend.map((point) => {
          const savings = Number(point.cache_savings_usd);
          const heightPct =
            maxSavings > 0 ? Math.max((savings / maxSavings) * 100, 4) : 4;
          return (
            <div
              key={`cache-${point.year}-${point.month}`}
              className="group flex flex-1 flex-col items-center gap-1"
              title={`${point.month}/${point.year}: ${formatAiUsd(savings)} saved · ${point.cached_input_tokens.toLocaleString()} cached · ${formatCacheHitRate(point.cache_hit_rate)}`}
            >
              <div
                className="w-full rounded-sm bg-emerald-500/60 transition-colors group-hover:bg-emerald-500/80"
                style={{ height: `${heightPct}%`, minHeight: "3px" }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1 text-[10px] text-muted-foreground">
        {trend.map((point) => (
          <span key={`label-${point.year}-${point.month}`} className="flex-1 text-center">
            {point.month}
          </span>
        ))}
      </div>
    </div>
  );
}
