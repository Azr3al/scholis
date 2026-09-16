// scripts/check-legacy-tokens.ts
import fs from "node:fs";
import path from "node:path";
import { LEGACY_TOKEN_CLASS_PATTERN } from "../src/lib/sj/legacy-token-aliases";

const ROOT = path.join(__dirname, "..", "src");
const ALLOWLIST = new Set([
  "src/lib/sj/legacy-token-aliases.ts",
  "src/lib/sj/legacy-token-aliases.test.ts",
  "src/app/globals.css",
]);

const LEGACY_BASELINE_PATH = path.join(__dirname, "..", "docs/legacy-token-baseline.json");

const args = new Set(process.argv.slice(2));
const writeBaseline = args.has("--write-baseline");
const updateBaseline = args.has("--update-baseline");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, out);
    } else if (/\.(tsx?|css)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function rel(p: string): string {
  return path.relative(path.join(__dirname, ".."), p).split(path.sep).join("/");
}

function countLegacy(filePath: string): number {
  const content = fs.readFileSync(filePath, "utf8");
  const matches = content.match(new RegExp(LEGACY_TOKEN_CLASS_PATTERN, "g"));
  return matches?.length ?? 0;
}

function scan(): { total: number; counts: Record<string, number> } {
  const files = walk(ROOT);
  const counts: Record<string, number> = {};
  let total = 0;

  for (const file of files) {
    const r = rel(file);
    if (ALLOWLIST.has(r)) continue;
    const n = countLegacy(file);
    if (n > 0) {
      counts[r] = n;
      total += n;
    }
  }

  return { total, counts };
}

function writeBaselineFile(payload: { total: number; counts: Record<string, number> }): void {
  fs.writeFileSync(LEGACY_BASELINE_PATH, JSON.stringify(payload, null, 2) + "\n");
}

const { total, counts } = scan();

if (!fs.existsSync(LEGACY_BASELINE_PATH)) {
  if (writeBaseline) {
    writeBaselineFile({ total, counts });
    console.log(
      `Wrote baseline: ${total} legacy token usages across ${Object.keys(counts).length} files`,
    );
    process.exit(0);
  }
  console.error(
    `Missing baseline at ${path.relative(path.join(__dirname, ".."), LEGACY_BASELINE_PATH)}. ` +
      "Run with --write-baseline to create it intentionally.",
  );
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(LEGACY_BASELINE_PATH, "utf8")) as {
  total: number;
  counts: Record<string, number>;
};

if (updateBaseline) {
  const violations: string[] = [];

  if (total > baseline.total) {
    violations.push(`total: ${baseline.total} → ${total} (increase not allowed)`);
  }

  for (const [file, count] of Object.entries(counts)) {
    const base = baseline.counts[file] ?? 0;
    if (count > base) {
      violations.push(`${file}: ${base} → ${count} (increase not allowed)`);
    }
  }

  if (violations.length > 0) {
    console.error(
      "--update-baseline rejected: counts must only decrease (migration PR ratchet):\n" +
        violations.join("\n"),
    );
    process.exit(1);
  }

  writeBaselineFile({ total, counts });
  console.log(
    `Updated baseline: ${baseline.total} → ${total} legacy token usages ` +
      `(${Object.keys(baseline.counts).length} → ${Object.keys(counts).length} files)`,
  );
  process.exit(0);
}

const regressions: string[] = [];

for (const [file, count] of Object.entries(counts)) {
  const base = baseline.counts[file] ?? 0;
  if (count > base) {
    regressions.push(`${file}: ${base} → ${count}`);
  }
}

let failed = false;

if (total > baseline.total) {
  console.error(`Legacy token total increased: ${baseline.total} → ${total}`);
  failed = true;
}

if (regressions.length > 0) {
  console.error("New legacy token usages detected:\n" + regressions.join("\n"));
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log(`Legacy token gate OK (${total} total, baseline ${baseline.total})`);
