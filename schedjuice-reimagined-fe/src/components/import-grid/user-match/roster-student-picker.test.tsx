import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RosterStudentPicker } from "./roster-student-picker";

describe("RosterStudentPicker", () => {
  afterEach(() => {
    cleanup();
  });

  it("pre-fills search from imported name and maps API candidates to scored suggestions", () => {
    const { container } = render(
      <RosterStudentPicker
        rawEmail="hlahla@hlahla.com"
        importedName="Hla Hla"
        candidates={[
          {
            user: { id: 9, name: "Hla Hla", email: "hlahla@hlahla.com", code: null, profile_image: null, roles: [] },
            score: 88,
            field: "name",
          },
        ]}
        rosterStudents={[
          {
            user_course_id: 1,
            id: 9,
            name: "Hla Hla",
            email: "hlahla@hlahla.com",
          },
        ]}
        onPickStudent={() => {}}
      />,
    );

    const input = container.querySelector("input");
    expect(input?.value).toBe("Hla Hla");
    expect(screen.getByText("name ≈ 88")).toBeTruthy();
    expect(screen.getByText(/Spreadsheet value/i)).toBeTruthy();
  });

  it("filters roster students when the query no longer matches the initial import value", () => {
    const onPickStudent = vi.fn();

    render(
      <RosterStudentPicker
        rawEmail=""
        importedName="Other"
        candidates={[]}
        rosterStudents={[
          {
            user_course_id: 1,
            id: 9,
            name: "Hla Hla",
            email: "hlahla@hlahla.com",
          },
          {
            user_course_id: 2,
            id: 10,
            name: "Other Student",
            email: "other@example.com",
          },
        ]}
        onPickStudent={onPickStudent}
      />,
    );

    expect(screen.getByText("Other Student")).toBeTruthy();
    expect(screen.queryByText("Hla Hla")).toBeNull();
  });
});
