import {
  resolveUniversalLinkHost,
  schemeForUniversalLinkVariant,
} from "@/config/universal-link-registry";

export type AppDeepLinkInput = {
  host: string;
  pathname: string;
  search?: string;
};

export function buildAppDeepLink(input: AppDeepLinkInput): string | null {
  const cfg = resolveUniversalLinkHost(input.host);
  if (!cfg) {
    return null;
  }
  const scheme = schemeForUniversalLinkVariant(cfg.variant);
  const path = input.pathname.startsWith("/")
    ? input.pathname
    : `/${input.pathname}`;
  const search = input.search ?? "";
  return `${scheme}://${path}${search}`;
}
