// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "@/components/primitives/input";
import { TextShimmer } from "@/components/misc/text-shimmer";
import { OCR_FIELD_EXTRACTING_MESSAGE } from "@/lib/finances/ocr-payment-screenshot";

describe("TextShimmer", () => {
  it("uses the CSS shimmer class and spread duration vars", () => {
    const { container } = render(
      <TextShimmer className="text-base">{OCR_FIELD_EXTRACTING_MESSAGE}</TextShimmer>,
    );

    const shimmer = container.querySelector("span");
    expect(shimmer).toBeTruthy();
    expect(shimmer?.className).toContain("sj-text-shimmer");
    expect(shimmer?.getAttribute("style")).toContain("--spread:");
    expect(shimmer?.getAttribute("style")).toContain("--shimmer-duration:");
  });

  it("does not native-disable the input while extracting so the shimmer can animate", () => {
    const { container } = render(
      <Input
        value=""
        loadingPlaceholder={OCR_FIELD_EXTRACTING_MESSAGE}
        loadingPlaceholderActive={true}
        disabled={true}
      />,
    );

    const input = container.querySelector("input");
    const shimmer = container.querySelector('[aria-hidden="true"] .sj-text-shimmer');

    expect(input?.disabled).toBe(false);
    expect(input?.getAttribute("aria-disabled")).toBe("true");
    expect(shimmer).toBeTruthy();
  });
});
