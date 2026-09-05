import { describe, expect, it } from "vitest";
import {
  entityTitleBackAlignClassName,
  entityTitleStickyChromeClassName,
} from "./entity-title-chrome";

describe("entityTitleStickyChromeClassName", () => {
  it("full-bleeds PageContainer inset and uses elevated surface blur", () => {
    const cls = entityTitleStickyChromeClassName();
    expect(cls).toContain("-mx-4");
    expect(cls).toContain("sm:-mx-6");
    expect(cls).toContain("lg:-mx-8");
    expect(cls).toContain("bg-surface-elevated/95");
    expect(cls).toContain("backdrop-blur-sm");
    expect(cls).not.toContain("bg-surface/95");
  });
});

describe("entityTitleBackAlignClassName", () => {
  it("centers Back beside the title", () => {
    expect(entityTitleBackAlignClassName()).toContain("self-center");
  });
});
