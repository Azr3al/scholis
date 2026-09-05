/**
 * Hostname → app variant for Universal Links / App Links.
 * Keep in sync with `schedjuice-reimagined-mobile` `config/universal-link-hosts.cjs`.
 */
export type UniversalLinkVariant = "schedjuice" | "teachersucenter";

export type UniversalLinkHostRow = {
  host: string;
  variant: UniversalLinkVariant;
};

export const UNIVERSAL_LINK_HOSTS: UniversalLinkHostRow[] = [
  { host: "trphillips.schedjuice.com", variant: "schedjuice" },
  { host: "dev.schedjuice.com", variant: "schedjuice" },
  { host: "suconnect.teachersucenter.com", variant: "teachersucenter" },
];

const IOS_BUNDLE_BY_VARIANT: Record<UniversalLinkVariant, string> = {
  schedjuice: "com.schedjuice.mobile",
  teachersucenter: "com.schedjuice.teachersucenter",
};

const ANDROID_PACKAGE_BY_VARIANT: Record<UniversalLinkVariant, string> = {
  schedjuice: "com.schedjuice.mobile",
  teachersucenter: "com.schedjuice.teachersucenter",
};

export type ResolvedUniversalLinkHost = {
  variant: UniversalLinkVariant;
  iosBundleId: string;
  androidPackage: string;
};

export function resolveUniversalLinkHost(
  hostHeader: string | null,
): ResolvedUniversalLinkHost | null {
  if (!hostHeader) {
    return null;
  }
  const host = hostHeader.split(":")[0]?.toLowerCase() ?? "";
  const row = UNIVERSAL_LINK_HOSTS.find((h) => h.host === host);
  if (!row) {
    return null;
  }
  return {
    variant: row.variant,
    iosBundleId: IOS_BUNDLE_BY_VARIANT[row.variant],
    androidPackage: ANDROID_PACKAGE_BY_VARIANT[row.variant],
  };
}

export function buildAppleAppSiteAssociation(teamId: string, iosBundleId: string) {
  return {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [`${teamId}.${iosBundleId}`],
          components: [
            {
              "/": "*",
              exclude: true,
              comment:
                "Opt-in only: web prompt + custom scheme; no auto-open",
            },
          ],
        },
      ],
    },
  };
}

/** Empty — disables verified Android App Link auto-open (opt-in via custom scheme). */
export function buildAssetLinks() {
  return [];
}

const SCHEME_BY_VARIANT: Record<UniversalLinkVariant, string> = {
  schedjuice: "schedjuice-mobile",
  teachersucenter: "teachersucenter",
};

export function schemeForUniversalLinkVariant(
  variant: UniversalLinkVariant,
): string {
  return SCHEME_BY_VARIANT[variant];
}
