import { Card, CardContent, CardHeader, CardTitle } from "@/app/_chrome/card";
import { formatDecimalString } from "@/helpers/money";
import type { CashFlowAggregate } from "@/types/finance/cash-flow";

type AggregateCardsProps = {
  aggregate: CashFlowAggregate | undefined;
  currencySymbol: string;
};

export function AggregateCards({ aggregate, currencySymbol }: AggregateCardsProps) {
  return (
    <div className="flex w-full flex-wrap gap-4">
      <Card className="min-w-[200px] flex-1">
        <CardHeader>
          <CardTitle className="text-base">Total income</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">
            {formatDecimalString(aggregate?.total_income, currencySymbol)}
          </p>
        </CardContent>
      </Card>
      <Card className="min-w-[200px] flex-1">
        <CardHeader>
          <CardTitle className="text-base">Total expense</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">
            {formatDecimalString(aggregate?.total_expense, currencySymbol)}
          </p>
        </CardContent>
      </Card>
      <Card className="min-w-[200px] flex-1">
        <CardHeader>
          <CardTitle className="text-base">Total profit</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">
            {formatDecimalString(aggregate?.total_profit, currencySymbol)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
