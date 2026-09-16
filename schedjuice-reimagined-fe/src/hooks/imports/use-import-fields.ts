import { useQuery } from "@tanstack/react-query";

import { fetchImportFields, type ImportFieldDef } from "@/app/client-api/imports";

export function useImportFields(role: string, enabled = true) {
  return useQuery<ImportFieldDef[]>({
    queryKey: ["importFields", role],
    enabled,
    queryFn: () => fetchImportFields(role),
    staleTime: 60_000,
  });
}
