type CatalogEntry = { code: string; sentence: string; data_class: string; sensitive: boolean };
type CanGroup = { domain: string; scope: "all" | "own" | "n/a"; text: string; dataClasses: string[] };
export type Policy = {
  can: CanGroup[];
  cannot: { code: string; sentence: string; data_class: string }[];
  dataClasses: string[];
  canGrantRoles: boolean;
};

const domainOf = (code: string) => code.split(".")[0];

export function synthesizePolicy(held: string[], catalog: CatalogEntry[]): Policy {
  const heldSet = new Set(held);
  const byDomain = new Map<string, CatalogEntry[]>();
  for (const e of catalog) {
    if (!heldSet.has(e.code)) continue;
    const d = domainOf(e.code);
    (byDomain.get(d) ?? byDomain.set(d, []).get(d)!).push(e);
  }

  const can: CanGroup[] = [];
  for (const [domain, entries] of Array.from(byDomain.entries())) {
    const hasManageAll = heldSet.has(`${domain}.manage_all`);
    const hasViewAll = heldSet.has(`${domain}.view_all`);
    const scope: CanGroup["scope"] = hasManageAll ? "all" : hasViewAll ? "all" : "own";
    const verbs = entries
      .filter((e) => !e.code.endsWith(".view_all") && !e.code.endsWith(".manage_all"))
      .map((e) => e.sentence);
    const scopePhrase = hasManageAll
      ? "across the school"
      : hasViewAll
      ? "(can view the whole school; edits limited to their own)"
      : "limited to what they are assigned to";
    const text = verbs.length
      ? `Can ${verbs.join(", ")} — ${scopePhrase}.`
      : `Can view records ${scopePhrase}.`;
    can.push({ domain, scope, text, dataClasses: Array.from(new Set(entries.map((e) => e.data_class))) });
  }

  const cannot = catalog
    .filter((e) => e.sensitive && !heldSet.has(e.code))
    .map((e) => ({ code: e.code, sentence: e.sentence, data_class: e.data_class }));

  const dataClasses = Array.from(new Set(catalog.filter((e) => heldSet.has(e.code)).map((e) => e.data_class)));
  return { can, cannot, dataClasses, canGrantRoles: heldSet.has("rbac.manage") };
}
