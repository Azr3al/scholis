import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("keeps label in layout while loading so width is reserved", () => {
    render(<Button isLoading>Save changes</Button>);

    const button = screen.getByRole("button");
    const label = screen.getByText("Save changes");

    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(label.closest("span")?.className).toContain("invisible");
    expect(button.querySelector("svg")).toBeTruthy();
  });
});
