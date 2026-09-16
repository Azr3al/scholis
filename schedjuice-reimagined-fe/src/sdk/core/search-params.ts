/**
 * Port of `makeSearchParams` from `@/app/client-api/utils` for SDK-only consumers.
 * Pages/ResourceTable must not import client-api utils after cutover.
 */

export type SdkSearchQueryParams = {
  page?: number;
  size?: number;
  sorts?: string[];
  expand?: string[];
  fields?: string[];
  q?: string;
  csv?: boolean;
  all?: boolean;
  teacher_roster_order?: boolean;
  student_roster_order?: boolean;
};

function encodeArrayToBase64(array: string[]): string {
  return Buffer.from(JSON.stringify(array)).toString("base64");
}

function encodeQueryData(data: Record<string, string | undefined>): string {
  const parts: string[] = [];
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (value === undefined || value === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export function makeSearchParams(queryParams: SdkSearchQueryParams = {}): string {
  const data: Record<string, string | undefined> = {
    page: String(queryParams.page ?? 1),
    size: String(queryParams.size ?? 10),
    sorts: encodeArrayToBase64(queryParams.sorts ?? []),
    expand: encodeArrayToBase64(queryParams.expand ?? []),
    csv: String(queryParams.csv ?? false),
  };
  if (queryParams.q) {
    data.q = queryParams.q;
  }
  if (queryParams.all) {
    data.all = String(queryParams.all);
  }
  if (queryParams.fields?.length) {
    data.fields = encodeArrayToBase64(queryParams.fields);
  }
  if (queryParams.teacher_roster_order) {
    data.teacher_roster_order = "true";
  }
  if (queryParams.student_roster_order) {
    data.student_roster_order = "true";
  }
  return encodeQueryData(data);
}
