import type { FormSurface } from "@/types/form-config";

function sortedRolesParam(roles: string[]): string {
  return [...roles].filter(Boolean).sort().join(",");
}

export function formConfigKey(entityType: string, surface: FormSurface, roles: string[]) {
  return ["formConfig", entityType, surface, sortedRolesParam(roles)] as const;
}

export function formConfigUrl(entityType: string, surface: FormSurface, roles: string[]): string {
  const params = new URLSearchParams({
    entity_type: entityType,
    surface,
    roles: roles.filter(Boolean).join(","),
  });
  return `form-config?${params.toString()}`;
}
