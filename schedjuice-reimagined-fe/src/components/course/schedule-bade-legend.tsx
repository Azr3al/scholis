type ScheduleBadgeLegendProps = {
  variant?: "default" | "inline";
};

const ScheduleBadgeLegend = ({ variant = "default" }: ScheduleBadgeLegendProps) => {
  const legendItems = (
    <>
      <div className="flex items-center gap-2">
        <div className="size-3 rounded-full bg-primary" />
        <p>Every week</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="size-3 rounded-full bg-warning" />
        <p>In some weeks</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="size-3 rounded-full border border-primary bg-transparent" />
        <p>No schedule</p>
      </div>
    </>
  );

  if (variant === "inline") {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {legendItems}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1">
      <p className="text-sm font-semibold">Legends</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {legendItems}
      </div>
    </div>
  );
};

export default ScheduleBadgeLegend;
