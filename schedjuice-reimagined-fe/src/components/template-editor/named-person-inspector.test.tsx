import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STAFF_ROLE_FILTER } from "@/components/finances/payment-info-form-fields";
import type { Layer } from "@/lib/image-template/types";

const { captured } = vi.hoisted(() => ({
  captured: { props: null as null | Record<string, unknown> },
}));

vi.mock("@/components/form/entity-combobox", () => ({
  default: function MockStaffPicker(props: {
    value?: string;
    onChange?: (value: string) => void;
    entity?: string;
    filterParams?: unknown;
    label?: string;
  }) {
    captured.props = props;
    return (
      <div>
        <span data-testid="staff-value">{props.value || ""}</span>
        <button type="button" onClick={() => props.onChange?.("7")}>
          Pick staff
        </button>
        <button type="button" onClick={() => props.onChange?.("")}>
          Clear staff
        </button>
      </div>
    );
  },
}));

import { NamedPersonInspector } from "./named-person-inspector";

afterEach(() => {
  cleanup();
  captured.props = null;
});

const layer: Extract<Layer, { type: "named_person" }> = {
  id: "np1",
  type: "named_person",
  user_id: 0,
  x: 0,
  y: 0,
  width: 120,
  height: 24,
  z: 0,
};

describe("NamedPersonInspector", () => {
  it("offers a staff users combobox instead of a raw id field", () => {
    render(<NamedPersonInspector layer={layer} onChange={vi.fn()} />);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(captured.props?.entity).toBe("users");
    expect(captured.props?.filterParams).toEqual(STAFF_ROLE_FILTER);
    expect(captured.props?.label).toBe("Staff");
  });

  it("writes the selected staff id onto the layer", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NamedPersonInspector layer={layer} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Pick staff" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: "named_person", user_id: 7 }),
    );
  });

  it("clears the bound staff user", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <NamedPersonInspector layer={{ ...layer, user_id: 7 }} onChange={onChange} />,
    );
    expect(screen.getByTestId("staff-value").textContent).toBe("7");
    await user.click(screen.getByRole("button", { name: "Clear staff" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: "named_person", user_id: 0 }),
    );
  });
});
