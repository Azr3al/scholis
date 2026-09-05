import { describe, expect, it } from "vitest";
import { hasAnyGrant, studentsWithGrants } from "./board-students";
import type { AwardBoardStudent } from "@/types/award";

const empty: AwardBoardStudent = { id: 1, name: "A", grants: [] };
const awarded: AwardBoardStudent = {
  id: 2,
  name: "B",
  grants: [
    {
      id: 9,
      title: {
        id: 1,
        name: "Top 1",
        family: null,
        origin: "admin",
        is_pinned: true,
        display_template: null,
      },
    },
  ],
};

describe("board students", () => {
  it("hasAnyGrant is false when every student has an empty grants list", () => {
    expect(hasAnyGrant([empty])).toBe(false);
    expect(hasAnyGrant([])).toBe(false);
  });

  it("studentsWithGrants omits students with no grants", () => {
    expect(studentsWithGrants([empty, awarded]).map((s) => s.id)).toEqual([2]);
  });
});
