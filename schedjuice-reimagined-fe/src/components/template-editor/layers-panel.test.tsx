import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayersPanel } from "./layers-panel";
import type { Layer } from "@/lib/image-template/types";

afterEach(cleanup);

const layer: Layer = {
  id: "t1",
  type: "text",
  text: "Hello",
  x: 0,
  y: 0,
  width: 80,
  height: 24,
  z: 0,
};

describe("LayersPanel", () => {
  it("selects a buried layer without asking the parent to reorder", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const buried: Layer = { ...layer, id: "t0", z: 0 };
    const top: Layer = { ...layer, id: "t1", z: 1 };
    render(
      <LayersPanel
        layers={[buried, top]}
        selectedId="t1"
        onSelect={onSelect}
        onDelete={vi.fn()}
        label={(item) => item.id}
      />,
    );
    await user.click(screen.getByRole("button", { name: "t0" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("t0");
  });

  it("deletes the selected layer and stays inert when only the page is selected", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const { rerender } = render(
      <LayersPanel
        layers={[layer]}
        selectedId="page"
        onSelect={vi.fn()}
        onDelete={onDelete}
        label={(item) => item.type}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete layer" })).toHaveProperty(
      "disabled",
      true,
    );
    rerender(
      <LayersPanel
        layers={[layer]}
        selectedId="t1"
        onSelect={vi.fn()}
        onDelete={onDelete}
        label={(item) => item.type}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Delete layer" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
