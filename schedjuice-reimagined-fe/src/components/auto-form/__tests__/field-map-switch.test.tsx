import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it, afterEach } from "vitest";
import { z } from "zod";

import { renderMappedFieldControl } from "../field-map";
import { orgBooleanSwitchDefaults } from "@/lib/org/org-field-config";

describe("AutoFormSwitchControl layout", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders optional suffix for optional boolean switches", () => {
    render(
      renderMappedFieldControl({
        name: "is_legacy_discount_visible",
        zodItem: z.boolean().optional().describe("Show legacy discount fields"),
        fieldConfigItem: { fieldType: "switch" },
        field: {
          name: "is_legacy_discount_visible",
          value: false,
          onChange: () => {},
          onBlur: () => {},
          ref: () => {},
        },
      }),
    );

    expect(screen.getByText(/Show legacy discount fields/)).toBeTruthy();
    expect(screen.getByText(/· optional/)).toBeTruthy();
  });

});

describe("AutoForm field external errors", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows RHF/server error text on a natively-valid text field", () => {
    render(
      renderMappedFieldControl({
        name: "name",
        zodItem: z.string(),
        fieldConfigItem: {},
        field: {
          name: "name",
          value: "Basic Plan",
          onChange: () => {},
          onBlur: () => {},
          ref: () => {},
        },
        error: "payment plan with this name already exists.",
      }),
    );

    expect(
      screen.getByText("payment plan with this name already exists."),
    ).toBeTruthy();
  });
});

describe("orgBooleanSwitchDefaults", () => {
  it("maps every org boolean schema key to switch fieldType", () => {
    const defaults = orgBooleanSwitchDefaults();
    expect(defaults.is_fm_hm_course_display_enabled).toEqual({
      fieldType: "switch",
    });
    expect(defaults.is_legacy_discount_visible).toEqual({
      fieldType: "switch",
    });
    expect(defaults.is_microsoft_on).toEqual({ fieldType: "switch" });
    expect(defaults.transaction_screenshot_strategy).toBeUndefined();
  });
});
