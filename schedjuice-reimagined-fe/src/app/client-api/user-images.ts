import { axiosClient } from "@/lib/api";
import type {
  ResolvedUserImage,
  UserImageBatchResult,
  UserImageRow,
  UserImageType,
} from "@/types/user-image";

type ApiEnvelope<T> = { data: T };

export async function uploadUserImage(
  userId: number,
  imageType: UserImageType,
  file: File,
  opts?: { courseId?: number },
): Promise<UserImageRow> {
  const formData = new FormData();
  formData.append("image_type", imageType);
  formData.append("image", file);
  if (opts?.courseId != null) {
    formData.append("course_id", String(opts.courseId));
  }
  const res = await axiosClient.post<ApiEnvelope<UserImageRow>>(
    `users/${userId}/user-images`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return res.data.data;
}

export async function listUserImages(
  userId: number,
  imageType: UserImageType,
  page = 1,
): Promise<{ items: UserImageRow[]; count: number }> {
  const res = await axiosClient.get<
    ApiEnvelope<{ items: UserImageRow[]; count: number }>
  >(`users/${userId}/user-images`, {
    params: { image_type: imageType, page, size: 20 },
  });
  const data = res.data.data;
  return { items: data.items ?? [], count: data.count ?? 0 };
}

export async function resolveUserImage(
  userId: number,
  imageType: UserImageType,
): Promise<ResolvedUserImage> {
  const res = await axiosClient.get<ApiEnvelope<ResolvedUserImage>>(
    `users/${userId}/user-images/resolve`,
    { params: { image_type: imageType } },
  );
  return res.data.data;
}

export async function fetchUserImageUrls(
  userIds: number[],
  imageType: UserImageType,
): Promise<UserImageBatchResult> {
  const res = await axiosClient.post<ApiEnvelope<UserImageBatchResult>>(
    "user-image-urls",
    { user_ids: userIds, image_type: imageType },
  );
  const data = res.data.data;
  return {
    urls: data.urls ?? {},
    sources: data.sources ?? {},
  };
}
