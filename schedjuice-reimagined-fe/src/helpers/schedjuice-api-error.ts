import axios from "axios";

type ApiErrorBody = {
  isError?: boolean;
  details?: unknown;
  message?: unknown;
};

const GENERIC_API_CODES = new Set([
  "validation_error",
  "bad_request",
  "not_found",
  "creation failed because of some errors. 0 objects were created.",
]);

function flattenDrfMessages(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(flattenDrfMessages);
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, val]) => {
        const msgs = flattenDrfMessages(val);
        if (!msgs.length) return [];
        if (key === "non_field_errors") return msgs;
        return msgs.map((msg) => `${key}: ${msg}`);
      },
    );
  }
  return [];
}

function detailsToMessage(details: unknown): string | null {
  if (typeof details === "string" && details.trim()) {
    return details.trim();
  }
  if (details && typeof details === "object") {
    const record = details as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message.trim();
    }
    if (
      typeof record.details === "string" &&
      record.details.trim() &&
      Object.keys(record).length === 1
    ) {
      return record.details.trim();
    }
    const msgs = flattenDrfMessages(details);
    if (msgs.length) return msgs.join(" ");
  }
  return null;
}

/** Parse utilitas API error bodies and axios transport failures into user-facing text. */
export function parseSchedjuiceApiError(
  err: unknown,
  fallback = "Something went wrong.",
): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      if (err.code === "ERR_NETWORK") {
        return "Could not reach the server. Check that the backend is running and NEXT_PUBLIC_BASE_API_URL is configured.";
      }
      if (err.code === "ECONNABORTED") {
        return "The request timed out. Try again.";
      }
      if (err.message?.trim()) {
        return err.message.trim();
      }
      return "Could not reach the server. Check your network connection.";
    }

    const data = err.response.data as ApiErrorBody | undefined;
    const fromDetails = detailsToMessage(data?.details);
    if (fromDetails) return fromDetails;

    const message =
      typeof data?.message === "string" ? data.message.trim() : "";
    if (message && !GENERIC_API_CODES.has(message)) {
      return message;
    }

    const status = err.response.status;
    if (status === 404) {
      return "The save endpoint was not found. The backend may need to be updated or restarted.";
    }
    if (status === 403) {
      return "You do not have permission to save program structure.";
    }
    if (status === 401) {
      return "Your session expired. Sign in again and retry.";
    }
    if (status >= 500) {
      return "The server failed while saving. Try again in a moment.";
    }
    if (status === 400 && message === "validation_error") {
      return "The structure could not be saved because it failed validation.";
    }

    return fallback;
  }

  if (err instanceof Error && err.message.trim()) {
    return err.message.trim();
  }

  const ax = err as { response?: { data?: ApiErrorBody } };
  const fromWrappedDetails = detailsToMessage(ax?.response?.data?.details);
  if (fromWrappedDetails) return fromWrappedDetails;

  return fallback;
}
