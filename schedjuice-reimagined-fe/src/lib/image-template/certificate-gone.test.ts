import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return [path];
  });
}

describe("certificate template product gone", () => {
  it("src has no certificate adapter or templates/certificate route", () => {
    const root = join(process.cwd(), "src");
    const hits: string[] = [];
    for (const file of walk(root)) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      if (file.endsWith("certificate-gone.test.ts")) continue;
      const text = readFileSync(file, "utf8");
      if (
        text.includes("adapters/certificate") ||
        text.includes('kind: "certificate"') ||
        text.includes('kind === "certificate"')
      ) {
        hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });
});
