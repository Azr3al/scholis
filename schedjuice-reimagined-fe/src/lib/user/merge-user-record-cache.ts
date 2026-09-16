/** TanStack cache entry shape from `fetchEntity("users", id, expand)`. */
export type UserRecordCacheEntry = {
  data?: { data?: Record<string, unknown> };
};

function asCustomDataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Merge a PUT user response into the record query cache.
 * Deep-merges `custom_data` and preserves expand-only fields from the cached GET.
 */
export function mergeUserRecordCache(
  prev: UserRecordCacheEntry | undefined,
  updatedUser: Record<string, unknown> | undefined | null,
): UserRecordCacheEntry {
  if (!updatedUser) {
    return prev ?? { data: { data: {} } };
  }

  if (!prev?.data?.data) {
    return { data: { data: { ...updatedUser } } };
  }

  const prevUser = prev.data.data;
  const mergedUser: Record<string, unknown> = { ...prevUser, ...updatedUser };

  if ("custom_data" in updatedUser) {
    const nextCustom = asCustomDataRecord(updatedUser.custom_data);
    const prevCustom = asCustomDataRecord(prevUser.custom_data);
    mergedUser.custom_data = { ...prevCustom, ...nextCustom };
  }

  return {
    ...prev,
    data: {
      ...prev.data,
      data: mergedUser,
    },
  };
}
