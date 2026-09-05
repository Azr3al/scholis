export type ParsedSubjectRow = {
  name: string;
  mergedCount: number;
};

type ParseOptions = {
  stripSections: boolean;
  titleCase: boolean;
  splitCommas: boolean;
};

const HEADER_TOKENS = new Set([
  "subject",
  "subjects",
  "section",
  "sections",
  "paper",
  "papers",
  "name",
]);

const SECTION_SUFFIX =
  /\s*(?:[-–—]\s*|\(\s*|\bsec(?:tion)?\.?\b\s*\(?\s*)[a-z0-9]{1,3}\s*\)?\s*$/i;

export function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripSectionSuffix(raw: string): string {
  const stripped = raw.replace(SECTION_SUFFIX, "").trim();
  return stripped.length ? stripped : raw.trim();
}

function toTitleCase(raw: string): string {
  return raw.replace(
    /\S+/g,
    (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
  );
}

function splitPasteTokens(text: string, splitCommas: boolean): string[] {
  let tokens = text
    .split(/\r?\n/)
    .flatMap((line) => line.split("\t"))
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (splitCommas) {
    tokens = tokens.flatMap((token) =>
      token
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    );
  }

  return tokens;
}

export function parseSubjectColumn(
  text: string,
  opts: ParseOptions,
): ParsedSubjectRow[] {
  const tokens = splitPasteTokens(text, opts.splitCommas);

  if (tokens.length && HEADER_TOKENS.has(tokens[0].toLowerCase())) {
    tokens.shift();
  }

  const order: string[] = [];
  const byKey = new Map<string, ParsedSubjectRow>();

  for (const token of tokens) {
    let name = token;
    if (opts.stripSections) name = stripSectionSuffix(name);
    if (opts.titleCase) name = toTitleCase(name);
    name = name.replace(/\s+/g, " ").trim();
    if (!name) continue;

    const key = normalizeKey(name);
    const existing = byKey.get(key);
    if (existing) {
      existing.mergedCount += 1;
    } else {
      byKey.set(key, { name, mergedCount: 1 });
      order.push(key);
    }
  }

  return order.map((k) => byKey.get(k) as ParsedSubjectRow);
}
