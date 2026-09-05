/**
 * Match OrganizationSerializer.create: schema_name = "x" + domain_url.lower().replace(".", "")
 */
export function schemaNameFromDomainUrl(domainUrl: string): string {
  return `x${domainUrl.toLowerCase().replace(/\./g, "")}`;
}

/** Preserve `?tenantId=` when linking between internal Microsoft tools. */
export function withInternalTenantId(
  href: string,
  tenantId: string | null | undefined,
): string {
  if (!tenantId) return href;
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("tenantId", tenantId);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
