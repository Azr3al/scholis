import { axiosClient } from "@/lib/api";
import { encodeQueryData } from "@/app/client-api/utils";

export type UserSuggestRow = {
  id: number;
  name: string;
  email: string;
  code: string | null;
  roles: string[];
  profile_image: string | null;
};

export type SuggestUsersOptions = {
  includeInactive?: boolean;
  signal?: AbortSignal;
};

/** GET /users/suggest?q= — FTS/trigram typeahead (Redis-cached on backend). */
export async function suggestUsers(
  q: string,
  options: SuggestUsersOptions = {},
): Promise<UserSuggestRow[]> {
  const trimmed = (q || "").trim();
  if (trimmed.length < 2) {
    return [];
  }
  const params: Record<string, string> = { q: trimmed };
  if (options.includeInactive) {
    params.include_inactive = "true";
  }
  const res = await axiosClient.get(
    `users/suggest${encodeQueryData(params)}`,
    { signal: options.signal },
  );
  return (res.data?.data ?? []) as UserSuggestRow[];
}
