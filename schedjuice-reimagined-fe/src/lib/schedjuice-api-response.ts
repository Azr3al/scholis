import type { AxiosResponse } from "axios";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";

type Envelope<T> = {
  isError?: boolean;
  message?: string;
  data?: T;
  details?: unknown;
};

export function assertSchedjuiceSuccess<T>(
  response: AxiosResponse<Envelope<T>>,
): T {
  const body = response.data;
  if (body?.isError) {
    const err = { response: { data: body } };
    throw new Error(parseSchedjuiceApiError(err, body.message || "Request failed"));
  }
  return body.data as T;
}
