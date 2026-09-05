import { makePostRequest } from "@/app/client-api/utils";
import {
  ID_PHOTO_URL_BATCH_SIZE,
  type IdPhotoUrlVariant,
} from "@/lib/id-photo-url-cache";

export type { IdPhotoUrlVariant } from "@/lib/id-photo-url-cache";

export async function fetchIdPhotoUrls(
  userIds: number[],
  variant: IdPhotoUrlVariant,
): Promise<Record<string, string | null>> {
  const res = await makePostRequest("id-photo-urls", {
    user_ids: userIds,
    variant,
  });
  return (res.data?.data?.urls ?? {}) as Record<string, string | null>;
}

export async function fetchIdPhotoUrlsBatched(
  userIds: number[],
  variant: IdPhotoUrlVariant,
): Promise<Record<string, string | null>> {
  if (userIds.length === 0) return {};
  const merged: Record<string, string | null> = {};
  for (let i = 0; i < userIds.length; i += ID_PHOTO_URL_BATCH_SIZE) {
    const chunk = userIds.slice(i, i + ID_PHOTO_URL_BATCH_SIZE);
    Object.assign(merged, await fetchIdPhotoUrls(chunk, variant));
  }
  return merged;
}
