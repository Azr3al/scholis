// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import type { OrgSectionId } from "@/config/org-record-sections";

import { orgSectionAnchorId } from "./org-section-anchors";
import { pickActiveOrgSection } from "./org-section-scroll-spy";

describe("orgSectionAnchorId", () => {
  it("prefixes section ids", () => {
    expect(orgSectionAnchorId("invoicing")).toBe("org-section-invoicing");
  });
});

describe("pickActiveOrgSection", () => {
  const sectionIds = [
    "overview",
    "profile",
    "invoicing",
  ] as OrgSectionId[];

  function mockScrollRoot(
    scrollTop: number,
    scrollHeight: number,
    clientHeight: number,
    top = 0,
  ): HTMLElement {
    return {
      scrollTop,
      scrollHeight,
      clientHeight,
      getBoundingClientRect: () => ({
        top,
        bottom: top + clientHeight,
        left: 0,
        right: 0,
        width: 800,
        height: clientHeight,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }),
    } as HTMLElement;
  }

  it("returns the last section when scrolled to the bottom", () => {
    const root = mockScrollRoot(900, 1000, 100);
    expect(
      pickActiveOrgSection({ sectionIds, scrollRoot: root }),
    ).toBe("invoicing");
  });

  it("returns null when no sections are provided", () => {
    const root = mockScrollRoot(0, 100, 100);
    expect(
      pickActiveOrgSection({ sectionIds: [], scrollRoot: root }),
    ).toBeNull();
  });

  it("uses the previous section when scrolling up past a boundary", () => {
    const root = mockScrollRoot(200, 1000, 100);
    const tops: Record<string, number> = {
      overview: 40,
      profile: 72,
      invoicing: 500,
    };

    vi.spyOn(document, "getElementById").mockImplementation((id) => {
      const sectionId = id.replace("org-section-", "");
      const top = tops[sectionId];
      if (top == null) return null;
      return {
        getBoundingClientRect: () => ({
          top,
          bottom: top + 40,
          left: 0,
          right: 0,
          width: 800,
          height: 40,
          x: 0,
          y: top,
          toJSON: () => ({}),
        }),
      } as HTMLElement;
    });

    expect(
      pickActiveOrgSection({
        sectionIds,
        scrollRoot: root,
        scrollDirection: "up",
      }),
    ).toBe("overview");
  });
});
