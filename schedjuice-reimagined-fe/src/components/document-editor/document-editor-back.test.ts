import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("document editor Back href", () => {
  it("routes Back to /studio, not /documents", () => {
    const src = readFileSync(
      "src/components/document-editor/document-editor.tsx",
      "utf8",
    );
    expect(src).toContain('router.push("/studio")');
    expect(src).not.toContain('router.push("/documents")');
  });
});
