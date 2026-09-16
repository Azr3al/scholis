export type UserImageType = "award_image" | "id_image";

export type UserImageRow = {
  id: number;
  user: number;
  image_type: UserImageType;
  image_url: string | null;
  uploaded_by: { id: number; name: string } | null;
  created_at: string;
};

export type ResolvedUserImage = {
  source: "user_image" | "legacy_id_photo" | null;
  url: string | null;
  user_image_id: number | null;
  created_at: string | null;
};

export type UserImageBatchResult = {
  urls: Record<string, string | null>;
  sources: Record<string, string | null>;
};

export const USER_IMAGE_TYPE_LABELS: Record<UserImageType, string> = {
  award_image: "Award Photo",
  id_image: "ID Photo",
};
