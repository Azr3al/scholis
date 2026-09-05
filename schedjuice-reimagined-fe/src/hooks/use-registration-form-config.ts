import { useQuery } from "@tanstack/react-query";

import { axiosClient } from "@/lib/api";
import { parseFormConfig } from "@/lib/custom-fields/parse-form-config";
import type { FormConfig } from "@/types/form-config";

export const REGISTRATION_FORM_CONFIG_KEY = ["registrationFormConfig"] as const;

type Options = { enabled?: boolean };

export function useRegistrationFormConfig(options?: Options) {
  const enabled = options?.enabled !== false;
  return useQuery<FormConfig>({
    queryKey: REGISTRATION_FORM_CONFIG_KEY,
    enabled,
    queryFn: async () => {
      const res = await axiosClient.get("registration/form-config");
      return parseFormConfig(res.data);
    },
    staleTime: 60_000,
  });
}
