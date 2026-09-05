import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PAGE_DENSITY_CLASS,
  resolvePageDensity,
  routeFamilyPageWidth,
} from "@/lib/layout/page-composition";

describe("page-composition", () => {
  it("maps admin list family to wide comfortable width", () => {
    expect(routeFamilyPageWidth("admin-crud-list")).toEqual({
      width: "wide",
      density: "comfortable",
    });
  });

  it("maps finance family to full dense exception", () => {
    expect(routeFamilyPageWidth("finance-operations")).toEqual({
      width: "full",
      density: "dense",
    });
  });

});

const MIGRATED_ROUTES = [
  "src/app/(internal)/campuses/page.tsx",
  "src/app/(internal)/programs/page.tsx",
  "src/app/(internal)/subjects/create/page.tsx",
];

describe("migrated route static gate", () => {

});
