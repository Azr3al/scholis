"use client";

import { uploadUserImage } from "@/app/client-api/user-images";
import type { UserImageType } from "@/types/user-image";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

export function isAcceptedUserImage(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(file.type) && file.size <= MAX_BYTES;
}

export function useUserImageUpload({
  userId,
  queryKey,
  courseId,
}: {
  userId: number;
  queryKey: unknown[];
  courseId?: number;
}) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({
      imageType,
      file,
      courseId: uploadCourseId,
    }: {
      imageType: UserImageType;
      file: File;
      courseId?: number;
    }) => {
      if (!isAcceptedUserImage(file)) {
        throw new Error("File must be JPEG, PNG, or WebP and at most 10 MB.");
      }
      return uploadUserImage(userId, imageType, file, {
        courseId: uploadCourseId ?? courseId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["user-image-resolve", userId] });
      qc.invalidateQueries({ queryKey: ["user-image-history", userId] });
      qc.invalidateQueries({ queryKey: ["course-student-photo-urls"] });
    },
  });
  return { uploadUserImage: mutation.mutateAsync, busy: mutation.isLoading };
}
