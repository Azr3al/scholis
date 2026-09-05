type GlobalRouteLayoutVariant = "auth-minimal" | "public-card" | "shell-standard";

export function resolveGlobalRouteLayout(route: string): GlobalRouteLayoutVariant {
  if (route.startsWith("/(public)/(auth)/") || route === "/(public)/register") {
    return "auth-minimal";
  }
  if (
    route.startsWith("/(public)/") &&
    route !== "/(public)/people/[slug]" &&
    route !== "/(public)/watch/[token]"
  ) {
    return "public-card";
  }
  return "shell-standard";
}

export function globalRoutePageWidth(
  variant: GlobalRouteLayoutVariant,
): "narrow" | "default" | "full" {
  if (variant === "auth-minimal") return "narrow";
  if (variant === "public-card") return "default";
  return "default";
}
