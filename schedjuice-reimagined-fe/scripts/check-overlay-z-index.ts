// scripts/check-overlay-z-index.ts
import fs from "node:fs";
import path from "node:path";
import {
  isDocumentedBracketZUtility,
  isDocumentedOverlayException,
} from "../src/lib/ui/overlay-layers";

const ROOT = path.join(__dirname, "..", "src");
const ALLOWED = new Set([
  "z-base", "z-sticky", "z-navigation", "z-dropdown", "z-banner",
  "z-modal-backdrop", "z-modal-content", "z-modal-dropdown", "z-toast", "z-emergency",
  "z-0", "z-10", "z-20", "z-30", // in-flow stacking (non-portal)
]);
const NUMERIC_Z_PATTERN = /\bz-\[?\d+\]?/g;
const BRACKET_Z_PATTERN = /\bz-\[[^\]]+\]/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(entry.name) && !/\.test\.(tsx?|mts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const violations: string[] = [];

for (const file of walk(ROOT)) {
  const rel = path.relative(path.join(__dirname, ".."), file).split(path.sep).join("/");
  if (isDocumentedOverlayException(rel)) continue;
  const content = fs.readFileSync(file, "utf8");

  const numericMatches = content.match(NUMERIC_Z_PATTERN) ?? [];
  for (const m of numericMatches) {
    if (ALLOWED.has(m)) continue;
    violations.push(`${rel}: ${m}`);
  }

  const bracketMatches = content.match(BRACKET_Z_PATTERN) ?? [];
  for (const m of bracketMatches) {
    if (isDocumentedBracketZUtility(m)) continue;
    violations.push(`${rel}: ${m}`);
  }
}

if (violations.length > 0) {
  console.error("Undocumented z-index utilities:\n" + violations.join("\n"));
  process.exit(1);
}

console.log("Overlay z-index gate OK");
