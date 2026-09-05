import { describe, expect, it } from "vitest";
import {
  STUDIO_CONTEXT_PARENT,
  visibleStudioRecordNavEntries,
  studioRecordNavActive,
} from "../studio-record-nav";

describe("STUDIO_CONTEXT_PARENT", () => {
  it("stays Documents at /studio for the icon rail", () => {
    expect(STUDIO_CONTEXT_PARENT).toEqual({
      label: "Documents",
      href: "/studio",
    });
  });
});

describe("visibleStudioRecordNavEntries", () => {
  it("omits Award titles without award_title.manage", () => {
    const entries = visibleStudioRecordNavEntries({
      canDocuments: true,
      canAwards: false,
    });
    expect(entries.map((e) => e.id)).toEqual(["documents"]);
  });

  it("omits Documents without document_template.manage", () => {
    const entries = visibleStudioRecordNavEntries({
      canDocuments: false,
      canAwards: true,
    });
    expect(entries.map((e) => e.id)).toEqual(["award_titles"]);
  });

  it("includes both when both permissions are held", () => {
    const entries = visibleStudioRecordNavEntries({
      canDocuments: true,
      canAwards: true,
    });
    expect(entries.map((e) => e.href)).toEqual(["/studio", "/award-titles"]);
  });
});

describe("studioRecordNavActive", () => {
  const docs = {
    id: "documents" as const,
    label: "Documents",
    href: "/studio",
    requiredPermissions: ["document_template.manage"],
  };
  const awards = {
    id: "award_titles" as const,
    label: "Award titles",
    href: "/award-titles",
    requiredPermissions: ["award_title.manage"],
  };

  it("marks Documents only on /studio", () => {
    expect(studioRecordNavActive(docs, "/studio")).toBe(true);
    expect(studioRecordNavActive(docs, "/award-titles")).toBe(false);
  });

  it("marks Award titles on nested award-title routes", () => {
    expect(studioRecordNavActive(awards, "/award-titles")).toBe(true);
    expect(studioRecordNavActive(awards, "/award-titles/3/edit")).toBe(true);
    expect(studioRecordNavActive(awards, "/studio")).toBe(false);
  });
});
