// scripts/inventory-sj-content-reset.ts
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "src");
const PATTERN = /sj-content-reset/g;

function walk(dir: string): Array<{ file: string; line: number; column: number }> {
  const hits: Array<{ file: string; line: number; column: number }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      hits.push(...walk(full));
    } else if (/\.(tsx?|css)$/.test(entry.name)) {
      const content = fs.readFileSync(full, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, index) => {
        let match: RegExpExecArray | null;
        const re = new RegExp(PATTERN);
        while ((match = re.exec(line)) !== null) {
          hits.push({
            file: path.relative(path.join(__dirname, ".."), full).split(path.sep).join("/"),
            line: index + 1,
            column: match.index + 1,
          });
        }
      });
    }
  }
  return hits;
}

const consumers = walk(ROOT);
const outPath = path.join(__dirname, "..", "docs/sj-content-reset-inventory.json");
fs.writeFileSync(
  outPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), consumers }, null, 2),
);
console.log(`Wrote ${consumers.length} sj-content-reset references to ${outPath}`);
