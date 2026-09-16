import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PasswordRequirementsList } from "./password-requirements";

describe("PasswordRequirementsList", () => {
  it("renders five rules and marks only lowercase met for 'a'", () => {
    const html = renderToStaticMarkup(
      createElement(PasswordRequirementsList, { password: "a" }),
    );
    expect(html).toContain("At least 8 characters");
    expect(html).toContain("Contains a number");
    expect(html).toContain("One lowercase letter");
    expect(html).toContain("One uppercase letter");
    expect(html).toContain("One special character");
    expect(html).toContain('aria-label="One lowercase letter: met"');
    expect(html).toContain('aria-label="At least 8 characters: not met"');
    expect(html).toContain("text-success");
    expect(html).toContain("text-text-secondary");
  });

  it("marks all met for a valid password", () => {
    const html = renderToStaticMarkup(
      createElement(PasswordRequirementsList, { password: "Abcdef1#" }),
    );
    for (const label of [
      "At least 8 characters",
      "Contains a number",
      "One lowercase letter",
      "One uppercase letter",
      "One special character",
    ]) {
      expect(html).toContain(`aria-label="${label}: met"`);
    }
  });
});
