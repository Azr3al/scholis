import { useQuery } from "@tanstack/react-query";

import { fetchJuiceBoxAttachments } from "@/lib/juicebox/fetch-by-resource";
import {
  mapJuiceBoxRowsToAttachmentTypes,
} from "@/lib/juicebox/map-rows";

type UseJuiceBoxAttachmentsParams = {
  resource: string;
  foreignKey: string;
  enabled?: boolean;
};

function juiceBoxAttachmentsQueryKey(
  resource: string,
  foreignKey: string
) {
  return ["juicebox-attachments", resource, foreignKey] as const;
}

export function useJuiceBoxAttachments({
  resource,
  foreignKey,
  enabled = true,
}: UseJuiceBoxAttachmentsParams) {
  return useQuery({
    queryKey: juiceBoxAttachmentsQueryKey(resource, foreignKey),
    queryFn: async () => {
      const response = await fetchJuiceBoxAttachments(resource, foreignKey);
      return mapJuiceBoxRowsToAttachmentTypes(
        response.attachments,
        resource
      );
    },
    enabled: enabled && Boolean(resource && foreignKey),
    refetchOnWindowFocus: false,
  });
}
