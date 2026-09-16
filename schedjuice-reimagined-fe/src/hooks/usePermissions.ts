import { permissionsFor } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";

export {
  SUPERADMIN_WILDCARD,
  makePermissionChecker,
} from "@/lib/rbac/permission-checker";

export function usePermissions() {
  const { user } = useUser(false);
  return permissionsFor(user);
}
