import { Card, CardContent, CardHeader, CardTitle } from "@/app/_chrome/card";
import { formatDecimalString } from "@/helpers/money";
import { cn } from "@/lib/utils";
import type { FinanceHomepageSummary } from "@/types/finance/homepage";

type FinanceHomepageStatCardsProps = {
  summary: FinanceHomepageSummary | undefined;
  currencySymbol: string;
};

function ChangeBadge({ pct }: { pct: number | null | undefined }) {
  if (pct == null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  const up = pct >= 0;
  return (
    <span className={cn("text-sm font-medium", up ? "text-emerald-600" : "text-red-600")}>
      {up ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export function FinanceHomepageStatCards({
  summary,
  currencySymbol,
}: FinanceHomepageStatCardsProps) {
  const comparison = summary?.comparison;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Collected
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-2xl font-semibold tabular-nums">
            {formatDecimalString(summary?.collected_amount, currencySymbol)}
          </p>
          <ChangeBadge pct={comparison?.collected_amount_pct} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Payments
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-2xl font-semibold tabular-nums">
            {summary?.collected_count ?? 0}
          </p>
          <ChangeBadge pct={comparison?.collected_count_pct} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Unpaid amount
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-2xl font-semibold tabular-nums">
            {formatDecimalString(summary?.unpaid_amount, currencySymbol)}
          </p>
          <ChangeBadge pct={comparison?.unpaid_amount_pct} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Unpaid students
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-2xl font-semibold tabular-nums">
            {summary?.unpaid_count ?? 0}
          </p>
          <ChangeBadge pct={comparison?.unpaid_count_pct} />
        </CardContent>
      </Card>
    </div>
  );
}
