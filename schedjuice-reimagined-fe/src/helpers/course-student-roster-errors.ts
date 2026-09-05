export function courseStudentActionErrorMessage(
  err: unknown,
  fallback: string,
): string {
  if (err && typeof err === "object" && "response" in err) {
    const data = (err as { response?: { data?: { details?: unknown } } })
      .response?.data;
    const details = data?.details;
    if (typeof details === "string") {
      return details;
    }
    if (details && typeof details === "object") {
      for (const value of Object.values(details as Record<string, unknown>)) {
        if (typeof value === "string") {
          return value;
        }
        if (
          Array.isArray(value) &&
          value.length > 0 &&
          typeof value[0] === "string"
        ) {
          return value[0];
        }
      }
    }
  }
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message?: string }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  return fallback;
}
