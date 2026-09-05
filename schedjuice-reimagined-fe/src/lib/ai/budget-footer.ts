export function limitSourceLabel(
  source: "user_override" | "org_default" | "platform_default",
): string {
  switch (source) {
    case "user_override":
      return "Custom limit";
    case "org_default":
      return "Org default";
    case "platform_default":
      return "Platform default ($1)";
  }
}
