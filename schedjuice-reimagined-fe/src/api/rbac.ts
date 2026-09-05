import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "@/lib/api";

export type RbacCatalogEntry = {
  code: string;
  label: string;
  sentence: string;
  data_class: string;
  tier: string;
  sensitive: boolean;
};

export type RbacRole = {
  id: number;
  slug: string;
  display_name: string;
  is_system: boolean;
  is_assignable: boolean;
  codes: string[];
};

export const RBAC_CATALOG_KEY = ["rbac", "catalog"] as const;
export const RBAC_ROLES_KEY = ["rbac", "roles"] as const;

async function fetchCatalog(): Promise<RbacCatalogEntry[]> {
  const { data } = await axiosClient.get("rbac/catalog");
  return data.data ?? [];
}

async function fetchRoles(): Promise<RbacRole[]> {
  const { data } = await axiosClient.get("rbac/roles");
  return data.data ?? [];
}

function invalidateRbacQueries(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: RBAC_ROLES_KEY });
  void qc.invalidateQueries({ queryKey: ["profile"] });
}

export function useCatalog() {
  return useQuery({
    queryKey: RBAC_CATALOG_KEY,
    queryFn: fetchCatalog,
    refetchOnWindowFocus: false,
  });
}

export function useRoles() {
  return useQuery({
    queryKey: RBAC_ROLES_KEY,
    queryFn: fetchRoles,
    refetchOnWindowFocus: false,
  });
}

export function useSaveRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, codes }: { roleId: number; codes: string[] }) =>
      axiosClient.put(`rbac/roles/${roleId}/permissions`, { codes }),
    onSuccess: () => invalidateRbacQueries(qc),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { slug: string; display_name: string }) =>
      axiosClient.post("rbac/roles", body),
    onSuccess: () => invalidateRbacQueries(qc),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      roleId,
      body,
    }: {
      roleId: number;
      body: { display_name?: string; description?: string };
    }) => axiosClient.patch(`rbac/roles/${roleId}`, body),
    onSuccess: () => invalidateRbacQueries(qc),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roleId: number) => axiosClient.delete(`rbac/roles/${roleId}`),
    onSuccess: () => invalidateRbacQueries(qc),
  });
}
