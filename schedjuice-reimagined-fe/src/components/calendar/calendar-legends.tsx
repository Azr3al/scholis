import { Star } from "iconoir-react";

const CalendarLegends = () => {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground"
      role="list"
      aria-label="Schedule legend"
    >
      <span className="font-medium text-foreground">Legend</span>
      <div className="flex items-center gap-2" role="listitem">
        <Star
          className="size-3 shrink-0 text-foreground"
          fill="currentColor"
          strokeWidth={1.5}
          aria-hidden
        />
        <span>Sabbath days</span>
      </div>
      <div className="flex items-center gap-2" role="listitem">
        <span
          className="size-1.5 shrink-0 rounded-full bg-brand"
          aria-hidden
        />
        <span>Class sessions</span>
      </div>
    </div>
  );
};

export default CalendarLegends;
