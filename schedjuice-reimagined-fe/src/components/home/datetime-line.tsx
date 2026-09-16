"use client";

import { useEffect, useMemo, useState } from "react";

import { formatHomeDatetimeLines } from "@/lib/home/format-home-datetime";
import { resolveTimeDisplayFormat } from "@/helpers/time-format";
import { useTenant } from "@/hooks/useTenant";

export function DatetimeLine() {
  const { tenant } = useTenant();
  const timeZone = tenant?.timezone ?? "UTC";
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const lines = useMemo(
    () => formatHomeDatetimeLines({ now, timeZone, timeFormat }),
    [now, timeZone, timeFormat],
  );

  return (
    <div className="sj-dateline">
      <span className="sj-dateline__gregorian">{lines.gregorian}</span>
      <span className="sj-dateline__myanmar">{lines.myanmar}</span>
    </div>
  );
}
