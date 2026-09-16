import { describe, it, expect } from "vitest";
import { selectSubjectChips, truncateSubjectChips } from "./subject-chips";
import { SubjectStrategy } from "@/types/program";

describe("selectSubjectChips", () => {
  it("returns single chip for required strategy", () => {
    const chips = selectSubjectChips({
      program: { subject_strategy: SubjectStrategy.required },
      subject: { id: 1, name: "Maths" },
    });
    expect(chips).toEqual([{ id: "1", name: "Maths" }]);
  });

  it("returns multi chips from course_subjects", () => {
    const chips = selectSubjectChips({
      program: { subject_strategy: SubjectStrategy.multi },
      course_subjects: [
        { subject: { id: 1, name: "F1" } },
        { subject: { id: 2, name: "F2" } },
      ],
    });
    expect(chips).toEqual([
      { id: "1", name: "F1" },
      { id: "2", name: "F2" },
    ]);
  });

  it("returns empty for none strategy", () => {
    expect(
      selectSubjectChips({
        program: { subject_strategy: SubjectStrategy.none },
        subject: { id: 1, name: "Maths" },
      }),
    ).toEqual([]);
  });
});

describe("truncateSubjectChips", () => {
  it("truncates at max and reports overflow", () => {
    const chips = [
      { id: "1", name: "A" },
      { id: "2", name: "B" },
      { id: "3", name: "C" },
    ];
    const result = truncateSubjectChips(chips, 2);
    expect(result.visible).toHaveLength(2);
    expect(result.overflow).toBe(1);
  });
});
