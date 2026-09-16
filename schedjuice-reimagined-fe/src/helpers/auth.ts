import { axiosClient } from "@/lib/api";
import { clearAuthCookies, getRefreshCredentials } from "@/helpers/auth-session";
import { getCookie } from "cookies-next";

export const logout = () => {
  const { refresh, session_id } = getRefreshCredentials();
  const schema = getCookie("schema");

  if (refresh && session_id) {
    axiosClient
      .post(
        "logout",
        { refresh, session_id },
        {
          headers: schema ? { "X-Tenant": String(schema) } : undefined,
        },
      )
      .catch(() => {
        /* best-effort server revocation */
      });
  }

  clearAuthCookies();
  window.location.href = "/login";
};
