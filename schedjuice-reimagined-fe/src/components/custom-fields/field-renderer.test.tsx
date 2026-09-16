import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it } from "vitest";

import type { FormConfigField } from "@/types/form-config";

import { FieldRenderer } from "./field-renderer";

afterEach(() => {
  cleanup();
});

const dobField: FormConfigField = {
  id: 1,
  source: "builtin",
  fieldKey: "date_of_birth",
  fieldLabel: "Date of birth",
  fieldType: "date",
  choices: null,
  description: "",
  requiredAt: "never",
  filledBy: "both",
  isFilterable: false,
  sortOrder: 0,
  validationRules: null,
  groupId: null,
};

function DateFieldHarness({
  required,
  defaultValue = "2005-09-13",
}: {
  required: boolean;
  defaultValue?: string | undefined;
}) {
  const form = useForm({
    defaultValues: { date_of_birth: defaultValue },
  });
  return (
    <>
      <FieldRenderer
        form={form}
        field={dobField}
        required={required}
        readOnly={false}
      />
      <output data-testid="value">
        {form.watch("date_of_birth") === undefined
          ? "undefined"
          : JSON.stringify(form.watch("date_of_birth"))}
      </output>
    </>
  );
}

describe("FieldRenderer date", () => {
  it("does not expose clear when the date field is required", () => {
    render(<DateFieldHarness required />);
    expect(screen.queryByRole("button", { name: "Clear date" })).toBeNull();
  });

  it("clears an optional date to undefined", async () => {
    const user = userEvent.setup();
    render(<DateFieldHarness required={false} />);

    await user.click(screen.getByRole("button", { name: "Clear date" }));

    expect(screen.getByTestId("value").textContent).toBe("undefined");
  });
});
