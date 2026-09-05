export type TitlePickOption = {
  id: number;
  name: string;
};

export type TitlePick =
  | { kind: "org"; titleId: number; name: string }
  | { kind: "local"; titleId: number; name: string }
  | { kind: "create"; name: string };

function findExact(query: string, titles: TitlePickOption[]): TitlePickOption | undefined {
  const needle = query.trim().toLowerCase();
  return titles.find((title) => title.name.trim().toLowerCase() === needle);
}

export function resolveTitlePick(
  query: string,
  orgTitles: TitlePickOption[],
  localTitles: TitlePickOption[],
): TitlePick {
  const name = query.trim();
  const org = findExact(name, orgTitles);
  if (org) {
    return { kind: "org", titleId: org.id, name: org.name };
  }
  const local = findExact(name, localTitles);
  if (local) {
    return { kind: "local", titleId: local.id, name: local.name };
  }
  return { kind: "create", name };
}
