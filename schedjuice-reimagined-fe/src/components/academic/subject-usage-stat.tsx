interface SubjectUsageStatProps {
  count?: number;
  includeAllCourses?: boolean;
  isLoading?: boolean;
  isError?: boolean;
}

export function SubjectUsageStat({
  count = 0,
  includeAllCourses = false,
  isLoading = false,
  isError = false,
}: SubjectUsageStatProps) {
  if (isLoading) {
    return <span className="text-sm text-text-muted">Loading usage…</span>;
  }
  if (isError) {
    return <span className="text-sm text-text-muted">Usage unavailable</span>;
  }

  const label = includeAllCourses ? "all-time courses" : "active courses";
  return (
    <span className="text-sm font-medium text-text-primary tabular-nums">
      {count} {label}
    </span>
  );
}
