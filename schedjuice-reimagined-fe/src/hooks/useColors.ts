import { fetchEntity } from "@/app/client-api/utils";
import { axiosClient } from "@/lib/api";
import { ORG_THEME_COOKIE } from "@/lib/sj/theme";
import { themeSchema } from "@/types/theme";
import { getCookie, setCookie } from "cookies-next";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import * as z from "zod";
import { useTenant } from "./useTenant";
import { DEFAULT_THEME } from "@/config/defaults";
import { getPropertyPaths } from "@/helpers/getPropertyPaths";

function normalizeTheme(
  raw: z.infer<typeof themeSchema> | null | undefined,
): z.infer<typeof themeSchema> {
  const tempTheme = { ...(raw ?? DEFAULT_THEME) };
  getPropertyPaths(themeSchema).forEach((path: string) => {
    if (!tempTheme[path.split(".")[0] as keyof typeof tempTheme]) {
      // @ts-ignore
      tempTheme[path.split(".")[0]] =
        DEFAULT_THEME[path.split(".")[0] as keyof typeof DEFAULT_THEME];
    }
  });
  return tempTheme;
}

function themeFromCookie(): z.infer<typeof themeSchema> | undefined {
  const themeCookie =
    getCookie(ORG_THEME_COOKIE) ??
    (() => {
      const legacy = getCookie("theme");
      if (typeof legacy === "string" && legacy.startsWith("{")) return legacy;
      return undefined;
    })();
  if (!themeCookie) return undefined;
  return normalizeTheme(JSON.parse(themeCookie as string));
}

export const useColors = (opts?: { orgId?: string | number }) => {
  const orgId = opts?.orgId;
  const isCrossOrg = orgId != null;
  const [theme, setTheme] = useState<z.infer<typeof themeSchema>>(DEFAULT_THEME);
  const [isLoading, setIsLoading] = useState(false);
  const { tenant } = useTenant();

  const orgQuery = useQuery({
    queryKey: ["getOrganization", orgId],
    queryFn: () => fetchEntity("organizations", orgId!),
    enabled: isCrossOrg,
  });

  useEffect(() => {
    if (isCrossOrg) {
      if (!orgQuery.isSuccess) return;
      const orgData = orgQuery.data?.data?.data as {
        theme?: z.infer<typeof themeSchema> | null;
      };
      setTheme(normalizeTheme(orgData?.theme ?? undefined));
      return;
    }

    const fromCookie = themeFromCookie();
    setTheme(fromCookie ? normalizeTheme(fromCookie) : DEFAULT_THEME);
  }, [isCrossOrg, orgQuery.isSuccess, orgQuery.data]);

  return {
    saveTheme: async (nextTheme: z.infer<typeof themeSchema>) => {
      setIsLoading(true);
      setTheme(nextTheme);

      if (isCrossOrg) {
        try {
          await axiosClient.put(`organizations/${orgId}`, { theme: nextTheme });
          return true;
        } catch (e) {
          console.error(e);
          return null;
        } finally {
          setIsLoading(false);
        }
      }

      setCookie(ORG_THEME_COOKIE, JSON.stringify(nextTheme), {
        maxAge: 60 * 60 * 24,
      });
      try {
        await axiosClient.put(`organizations/${tenant?.id}`, {
          theme: nextTheme,
        });
      } catch (e) {
        console.error(e);
        return null;
      } finally {
        setIsLoading(false);
        window.location.reload();
      }
    },
    theme,
    isLoading: isLoading || (isCrossOrg && orgQuery.isLoading),
  };
};
