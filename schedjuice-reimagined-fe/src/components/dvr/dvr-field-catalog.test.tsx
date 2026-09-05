import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { DvrFieldCatalog } from "./dvr-field-catalog";
import { DVR_BUILTIN_FIELD_NAMES, type DvrFieldConfig } from "@/helpers/dvr";
import type { CustomFieldDefinitionDto } from "@/types/custom-fields";

afterEach(() => {
  cleanup();
});

function Harness({
  initial,
  customDefs,
}: {
  initial: DvrFieldConfig[];
  customDefs?: CustomFieldDefinitionDto[];
}) {
  const [selectedFields, setSelectedFields] = useState(initial);
  return (
    <>
      <DvrFieldCatalog
        selectedFields={selectedFields}
        setSelectedFields={setSelectedFields}
        customDefs={
          customDefs ??
          ([
            {
              field_key: "t_shirt_size",
              field_label: "T-Shirt Size",
              source: "custom",
              is_active: true,
            },
          ] as CustomFieldDefinitionDto[])
        }
        defsLoading={false}
        defsError={false}
      />
      <pre data-testid="selection">{JSON.stringify(selectedFields)}</pre>
    </>
  );
}

function readSelection(): DvrFieldConfig[] {
  return JSON.parse(
    screen.getByTestId("selection").textContent || "[]",
  ) as DvrFieldConfig[];
}

describe("DvrFieldCatalog", () => {
  it("removes a field from selection when Include is unchecked", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { name: "phone_number", required: false },
          { name: "t_shirt_size", required: false },
        ]}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: /^phone number$/i }));
    const selection = readSelection();
    expect(selection.find((f) => f.name === "phone_number")).toBeUndefined();
    expect(selection.find((f) => f.name === "t_shirt_size")).toBeTruthy();
  });

  it("toggles Required without removing the field", async () => {
    const user = userEvent.setup();
    render(
      <Harness initial={[{ name: "phone_number", required: false }]} />,
    );
    const requiredLabel = document.querySelector(
      'label[for="phone_number-required"]',
    );
    expect(requiredLabel).toBeTruthy();
    await user.click(requiredLabel!);
    expect(readSelection()).toEqual([
      { name: "phone_number", required: true },
    ]);
  });

  it("Fields Clear all removes built-ins and leaves custom selected", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { name: "phone_number", required: true },
          { name: "city", required: false },
          { name: "t_shirt_size", required: false },
        ]}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Fields clear all" }),
    );
    const selection = readSelection();
    expect(selection).toEqual([{ name: "t_shirt_size", required: false }]);
  });

  it("Fields Select all adds missing built-ins without wiping required", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { name: "phone_number", required: true },
          { name: "t_shirt_size", required: false },
        ]}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Fields select all" }),
    );
    const selection = readSelection();
    expect(selection.find((f) => f.name === "phone_number")).toEqual({
      name: "phone_number",
      required: true,
    });
    for (const name of DVR_BUILTIN_FIELD_NAMES) {
      expect(selection.find((f) => f.name === name)).toBeTruthy();
    }
    expect(selection.find((f) => f.name === "t_shirt_size")).toEqual({
      name: "t_shirt_size",
      required: false,
    });
  });

  it("Custom Clear all / Select all only affect custom keys", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { name: "phone_number", required: true },
          { name: "t_shirt_size", required: false },
        ]}
        customDefs={
          [
            {
              field_key: "t_shirt_size",
              field_label: "T-Shirt Size",
              source: "custom",
              is_active: true,
            },
            {
              field_key: "occupation",
              field_label: "Occupation",
              source: "custom",
              is_active: true,
            },
          ] as CustomFieldDefinitionDto[]
        }
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Custom fields clear all" }),
    );
    expect(readSelection()).toEqual([
      { name: "phone_number", required: true },
    ]);

    await user.click(
      screen.getByRole("button", { name: "Custom fields select all" }),
    );
    const afterSelect = readSelection();
    expect(afterSelect.find((f) => f.name === "phone_number")).toEqual({
      name: "phone_number",
      required: true,
    });
    expect(afterSelect.find((f) => f.name === "t_shirt_size")).toEqual({
      name: "t_shirt_size",
      required: false,
    });
    expect(afterSelect.find((f) => f.name === "occupation")).toEqual({
      name: "occupation",
      required: false,
    });
  });
});
