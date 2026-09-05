import { WarningTriangle as AlertTriangle } from "iconoir-react";

type OngoingMonthBannerProps = {
  show: boolean;
};

export function OngoingMonthBanner({ show }: OngoingMonthBannerProps) {
  if (!show) return null;
  return (
    <div
      className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
      role="status"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span>
        Ongoing month. Totals can still change as sessions complete.
      </span>
    </div>
  );
}
