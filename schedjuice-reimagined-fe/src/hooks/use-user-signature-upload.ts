"use client";

import { updateEntity } from "@/app/client-api/utils";
import { dataUrlToPngFile } from "@/lib/user/signature-export";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useUserSignatureUpload({
  userId,
  queryKey,
}: {
  userId: number;
  queryKey: unknown[];
}) {
  const qc = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (dataUrl: string) => {
      const file = dataUrlToPngFile(dataUrl);
      const formData = new FormData();
      formData.append("user_signature", file);
      await updateEntity("users", userId, formData);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await updateEntity("users", userId, { user_signature: null });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return {
    uploadSignature: uploadMutation.mutateAsync,
    clearSignature: clearMutation.mutateAsync,
    busy: uploadMutation.isLoading || clearMutation.isLoading,
  };
}
