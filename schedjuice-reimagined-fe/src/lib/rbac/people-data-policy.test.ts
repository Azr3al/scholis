import { describe, expect, it } from "vitest";

import {
  PEOPLE_DATA_POLICY_HEADING,
  PEOPLE_DATA_POLICY_PARAGRAPHS,
} from "./people-data-policy";

describe("PEOPLE_DATA_POLICY_PARAGRAPHS", () => {
  it("has four spec sentences and names the identity allowlist", () => {
    expect(PEOPLE_DATA_POLICY_PARAGRAPHS).toHaveLength(4);
    expect(PEOPLE_DATA_POLICY_PARAGRAPHS[0]).toContain("full name");
    expect(PEOPLE_DATA_POLICY_PARAGRAPHS[1]).toContain("teacher assigned to a course");
    expect(PEOPLE_DATA_POLICY_PARAGRAPHS[2]).toContain("permission to edit users");
    expect(PEOPLE_DATA_POLICY_PARAGRAPHS[3]).toContain("Login email");
    expect(PEOPLE_DATA_POLICY_HEADING).toBe("People data");
  });
});
