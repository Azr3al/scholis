"use client";

import { useEffect, useMemo, useState } from "react";
import { NavArrowLeft as ChevronLeft, NavArrowRight as ChevronRight } from "iconoir-react";

import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { Button } from "@/components/primitives";
import { useTenant } from "@/hooks/useTenant";
import {
  getTenantMonthBoundariesIso,
  getTenantTodayYmd,
} from "@/helpers/shortcuts-time";

export type MonthBounds = { startIso: string; endIso: string };

function monthAnchorFromYmd(ymd: string): Date {
  const [y, m] = ymd.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

export function CourseFeedMonthToolbar({
  onBoundsChange,
}: {
  onBoundsChange: (bounds: MonthBounds) => void;
}) {
  const { tenant } = useTenant();
  const tz = tenant?.timezone ?? "UTC";
  const [monthAnchor, setMonthAnchor] = useState(() =>
    monthAnchorFromYmd(getTenantTodayYmd(tz)),
  );

  useEffect(() => {
    setMonthAnchor(monthAnchorFromYmd(getTenantTodayYmd(tz)));
  }, [tz]);

  const bounds = useMemo(
    () => getTenantMonthBoundariesIso(tz, monthAnchor),
    [tz, monthAnchor],
  );

  useEffect(() => {
    onBoundsChange(bounds);
  }, [bounds, onBoundsChange]);

  const shiftMonth = (delta: number) => {
    setMonthAnchor(
      (d) => new Date(d.getFullYear(), d.getMonth() + delta, 1),
    );
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Previous month"
        onClick={() => shiftMonth(-1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <YearMonthSelector date={monthAnchor} setDate={setMonthAnchor} inline />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Next month"
        onClick={() => shiftMonth(1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function defaultMonthBounds(timezone: string): MonthBounds {
  const anchor = monthAnchorFromYmd(getTenantTodayYmd(timezone));
  return getTenantMonthBoundariesIso(timezone, anchor);
}
