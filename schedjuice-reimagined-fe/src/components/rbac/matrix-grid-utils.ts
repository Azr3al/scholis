import type { RbacCatalogEntry, RbacRole } from "@/api/rbac";

export function domainOf(code: string): string {
  return code.split(".")[0];
}

export function formatDomainLabel(domain: string): string {
  return domain.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function groupCatalogByDomain(
  catalog: RbacCatalogEntry[],
): { domain: string; entries: RbacCatalogEntry[] }[] {
  const byDomain = new Map<string, RbacCatalogEntry[]>();
  for (const entry of catalog) {
    const domain = domainOf(entry.code);
    const list = byDomain.get(domain) ?? [];
    list.push(entry);
    byDomain.set(domain, list);
  }
  return Array.from(byDomain.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([domain, entries]) => ({
      domain,
      entries: entries.sort((a, b) => a.code.localeCompare(b.code)),
    }));
}

export function toggleRoleCode(
  codes: string[],
  code: string,
  checked: boolean,
): string[] {
  const set = new Set(codes);
  if (checked) set.add(code);
  else set.delete(code);
  return Array.from(set).sort();
}

export function codesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((code) => setA.has(code));
}

export function getChangedRoles(
  roles: RbacRole[],
  drafts: Record<number, string[]>,
): { roleId: number; codes: string[] }[] {
  return roles
    .filter((role) => {
      const draft = drafts[role.id];
      if (!draft) return false;
      return !codesEqual(role.codes, draft);
    })
    .map((role) => ({ roleId: role.id, codes: drafts[role.id]! }));
}

export function buildDraftMatrix(roles: RbacRole[]): Record<number, string[]> {
  return Object.fromEntries(roles.map((role) => [role.id, [...role.codes]]));
}
