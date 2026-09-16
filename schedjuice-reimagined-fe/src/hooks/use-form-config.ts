import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

import { axiosClient } from "@/lib/api";
import { parseFormConfig } from "@/lib/custom-fields/parse-form-config";
import { formConfigKey, formConfigUrl } from "@/lib/custom-fields/form-config-query";
import { CUSTOM_FIELD_ENTITY_USER } from "@/types/custom-fields";
import type { FormConfig, FormSurface } from "@/types/form-config";

type Options = Pick<UseQueryOptions<FormConfig>, "enabled" | "keepPreviousData">;

export function useFormConfig(
  surface: FormSurface,
  roles: string[],
  entityType: string = CUSTOM_FIELD_ENTITY_USER,
  options?: Options
) {
  const enabled = options?.enabled !== false;
  return useQuery<FormConfig>({
    queryKey: formConfigKey(entityType, surface, roles),
    enabled,
    queryFn: async () => {
      const res = await axiosClient.get(formConfigUrl(entityType, surface, roles));
      return parseFormConfig(res.data);
    },
    staleTime: 60_000,
    keepPreviousData: options?.keepPreviousData,
  });
}
