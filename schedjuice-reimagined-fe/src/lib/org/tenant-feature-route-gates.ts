import type { organizationType } from "@/types/organization";

export function tenantFeatureRedirectPath(
  pathname: string,
  tenant: Pick<organizationType, "is_library_disabled" | "is_crm_enabled">,
): "/home" | null {
  if (pathname.includes("library") && tenant.is_library_disabled) {
    return "/home";
  }
  if (pathname.startsWith("/crm") && !tenant.is_crm_enabled) {
    return "/home";
  }
  if (pathname.startsWith("/complaints") && !tenant.is_crm_enabled) {
    return "/home";
  }
  return null;
}
