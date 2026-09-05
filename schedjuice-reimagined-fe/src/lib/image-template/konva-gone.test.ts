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

describe("konva removal", () => {
  it("src has no konva or react-konva imports", () => {
    const root = join(process.cwd(), "src");
    const hits: string[] = [];
    for (const file of walk(root)) {
      if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      if (/from ['"]react-konva['"]|from ['"]konva['"]/.test(text)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });
});
