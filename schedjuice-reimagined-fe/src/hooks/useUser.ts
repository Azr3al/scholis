import { axiosClient } from "@/lib/api"
import { isSuperAdmin } from "@/helpers/authorization"
import { accountType, role } from "@/types/user"
import { useViewAsStore } from "@/store/view-as-store"
import { getCookie, setCookie } from "cookies-next"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { ACCOUNT_ROLES_COOKIE } from "@/lib/account-cookie"
import { isPublicWebPath } from "@/lib/public-web-paths";
import { isWebAuthPath } from "@/lib/linking/open-in-app-prompt-state"

function persistAccountCookies(account: accountType, expires: Date) {
  setCookie("account", JSON.stringify(account), { expires })
  setCookie(ACCOUNT_ROLES_COOKIE, JSON.stringify(account.roles ?? []), {
    expires,
  })
}

/** API/cookies may omit `roles`; normalize so UI never reads undefined.
 *  Spreads `raw` first, so optional RBAC fields (`permissions`, `rbac_version`) are preserved. */
export function normalizeAccountPayload(raw: accountType): accountType {
  return {
    ...raw,
    roles: Array.isArray(raw.roles) ? raw.roles : [],
  };
}

/**
 * Dedupes `users/profile` across every concurrent `useUser()` consumer.
 * Many components mount at once; without this each one fired its own request,
 * flooding the endpoint. Concurrent callers share a single in-flight promise;
 * the cookie is updated once it resolves so later mounts read from cache.
 */
let inflightProfileRequest: Promise<accountType> | null = null;

function fetchProfileDeduped(): Promise<accountType> {
  if (inflightProfileRequest) return inflightProfileRequest;
  inflightProfileRequest = axiosClient
    .get("users/profile")
    .then(({ data }) => {
      const normalized = normalizeAccountPayload(data.data);
      persistAccountCookies(
        normalized,
        new Date(Date.now() + 2 * 60 * 60 * 1000),
      );
      return normalized;
    })
    .catch((error) => {
      // Clear so a later mount can retry after a transient failure.
      inflightProfileRequest = null;
      throw error;
    });
  return inflightProfileRequest;
}

export const useUser = (pushToLoginIfUnauthenicated=true) => {
    const [realUser, setRealUser] = useState<accountType>()
    const [isLoading, setIsLoading] = useState(true)
    const router = useRouter()
    const pathname = usePathname()
    const viewAs = useViewAsStore()

    useEffect(() => {
        const fetchUser = async () => {
            if (pathname && (isWebAuthPath(pathname) || isPublicWebPath(pathname))) {
                setIsLoading(false)
                return
            }

            setIsLoading(true)
            try {
                if (!realUser) {
                    const cookieAccount = getCookie("account")
                    if (cookieAccount) {
                        const parsed = normalizeAccountPayload(
                          JSON.parse(String(cookieAccount))
                        )
                        const needsPermissions = !Array.isArray(parsed.permissions)
                        if (needsPermissions) {
                            setRealUser(await fetchProfileDeduped())
                        } else {
                            persistAccountCookies(
                              parsed,
                              new Date(Date.now() + 2 * 60 * 60 * 1000),
                            )
                            setRealUser(parsed)
                        }
                    } else {
                        setRealUser(await fetchProfileDeduped())
                    }
                }
            } catch (e) {
                if(pushToLoginIfUnauthenicated){

                    router.push(`/login?${new URLSearchParams({next: pathname})}`)
                }
                return null
            } finally {
                setIsLoading(false)
            }
        }
        fetchUser()
    }, [])

    const user = useMemo(() => {
        if (!realUser) return undefined
        if (
          viewAs.active &&
          isSuperAdmin(realUser) &&
          viewAs.roles.length > 0
        ) {
          return normalizeAccountPayload({
            ...realUser,
            roles: viewAs.roles as role[],
            permissions: viewAs.permissions,
          })
        }
        return realUser
    }, [realUser, viewAs.active, viewAs.permissions, viewAs.roles])

    const isAdminOrManager = Boolean(
      user?.roles?.includes(role.admin) ||
        user?.roles?.includes(role.manager) ||
        user?.roles?.includes(role.superadmin),
    );
    const isTeacher = Boolean(user?.roles?.includes(role.teacher));

    return {
        user,
        realUser,
        isLoading,
        setUser: (data: Partial<accountType>) => {
            const merged = normalizeAccountPayload({ ...realUser, ...data } as accountType)
            setRealUser(merged)
            persistAccountCookies(
              merged,
              new Date(Date.now() + 2 * 60 * 60 * 1000),
            )
        },
        isAdminOrManager,
        isTeacher,
        isOnlyTeacher: Boolean(isTeacher) && !Boolean(isAdminOrManager),
    }
}