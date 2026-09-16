import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OrgSettingHelp } from "./org-setting-help";

afterEach(() => {
  cleanup();
});

describe("OrgSettingHelp", () => {
  it("renders summary and expandable pseudo-code for auto_assign flag", () => {
    render(
      <OrgSettingHelp settingKey="auto_assign_creator_as_main_teacher" />,
    );
    expect(screen.getByText(/teacher-only creator/i)).toBeTruthy();
    // Pseudo-code is present in the DOM via <details> (expandable "How it works")
    expect(screen.getByText(/creator.roles/i)).toBeTruthy();
    expect(screen.getByText(/How it works/i)).toBeTruthy();
  });

  it("renders summary and expandable pseudo-code for is_course_role_enabled flag", () => {
    render(<OrgSettingHelp settingKey="is_course_role_enabled" />);
    expect(screen.getByText(/role picker hidden/i)).toBeTruthy();
    // Pseudo-code is present in the DOM via <details> (expandable "How it works")
    expect(screen.getByText(/sole_MT_role/i)).toBeTruthy();
    expect(screen.getByText(/How it works/i)).toBeTruthy();
  });

  it("renders nothing for unknown keys", () => {
    const { container } = render(
      <OrgSettingHelp settingKey="not_a_real_flag" />,
    );
    expect(container.innerHTML).toBe("");
  });
});
