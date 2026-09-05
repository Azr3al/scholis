"use client";

import { cn } from "@/lib/utils";

const FILTER_SEVERITIES = ["all", "warning", "danger", "success"] as const;
export type FilterSeverity = (typeof FILTER_SEVERITIES)[number];

const SEVERITY_STYLES: Record<FilterSeverity, { active: string; inactive: string }> = {
  all: {
    active: "bg-primary text-primary-foreground",
    inactive: "bg-muted text-muted-foreground hover:bg-muted/80",
  },
  warning: {
    active: "bg-amber-600 text-white dark:bg-amber-400 dark:text-slate-950",
    inactive: "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900",
  },
  danger: {
    active: "bg-red-600 text-white dark:bg-red-400 dark:text-slate-950",
    inactive: "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900",
  },
  success: {
    active: "bg-emerald-600 text-white dark:bg-emerald-400 dark:text-slate-950",
    inactive: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900",
  },
};

const SEVERITY_LABELS: Record<FilterSeverity, string> = {
  all: "All",
  warning: "Warning",
  danger: "Critical",
  success: "Success",
};

export interface NotificationSeverityFilterProps {
  value: FilterSeverity;
  onChange: (severity: FilterSeverity) => void;
}

export function NotificationSeverityFilter({
  value,
  onChange,
}: NotificationSeverityFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTER_SEVERITIES.map((severity) => {
        const isActive = value === severity;
        const styles = SEVERITY_STYLES[severity];
        const label = SEVERITY_LABELS[severity];

        return (
          <button
            key={severity}
            type="button"
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isActive ? styles.active : styles.inactive
            )}
            onClick={() => onChange(severity)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}