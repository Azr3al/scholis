import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { UploadFieldError } from "./upload-field-error";

afterEach(() => cleanup());

describe("UploadFieldError", () => {
  it("does not render an alert when message is empty", () => {
    const { container } = render(<UploadFieldError message="" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.firstElementChild?.className).toContain("grid-rows-[0fr]");
  });

  it("renders an alert and expands when message is set", () => {
    const { container } = render(
      <UploadFieldError message="Amount is required." />,
    );
    expect(screen.getByRole("alert").textContent).toBe("Amount is required.");
    expect(container.firstElementChild?.className).toContain("grid-rows-[1fr]");
    expect(container.firstElementChild?.className).toContain("duration-180");
  });

  it("keeps reduced-motion classes so OS preference can skip animation", () => {
    const { container } = render(<UploadFieldError message="Required" />);
    const cls = container.firstElementChild?.className ?? "";
    expect(cls).toMatch(/motion-reduce:(transition-none|duration-0)/);
  });
});
