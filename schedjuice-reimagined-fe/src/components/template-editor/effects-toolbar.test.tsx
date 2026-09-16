import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EffectsToolbar } from "./effects-toolbar";
import type { Layer } from "@/lib/image-template/types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const text: Layer = {
  id: "t1",
  type: "text",
  text: "Hello",
  x: 0,
  y: 0,
  width: 120,
  height: 32,
  z: 0,
  fontSize: 16,
  fontFamily: "Noto Sans",
  color: "#111111",
};

const photo: Layer = {
  id: "p1",
  type: "photo",
  photoKind: "award_image",
  x: 0,
  y: 0,
  width: 80,
  height: 100,
  z: 0,
  removeBackground: true,
  borderRadiusPt: 8,
};

describe("EffectsToolbar", () => {
  it("orders layers from the Layer menu", async () => {
    const user = userEvent.setup();
    const onChangeLayers = vi.fn();
    const above: Layer = { ...photo, id: "p2", z: 1 };
    render(
      <EffectsToolbar
        layer={text}
        layers={[text, above]}
        onChange={vi.fn()}
        onChangeLayers={onChangeLayers}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Layer" }));
    await user.click(screen.getByRole("menuitem", { name: "Bring to front" }));
    expect(onChangeLayers).toHaveBeenCalled();
    const next = onChangeLayers.mock.calls[0]?.[0] as Layer[];
    expect(next.at(-1)?.id).toBe("t1");
  });

  it("disables send backward when the layer is already at the back", async () => {
    const user = userEvent.setup();
    render(
      <EffectsToolbar
        layer={text}
        layers={[text, { ...photo, z: 1 }]}
        onChange={vi.fn()}
        onChangeLayers={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Layer" }));
    expect(
      screen.getByRole("menuitem", { name: "Send backward" }).getAttribute("data-disabled"),
    ).toBe("");
  });

  it("shows typography controls for text and not remove background", () => {
    render(<EffectsToolbar layer={text} onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Font family" })).toBeTruthy();
    expect(screen.getByLabelText("Font size")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Increase font size" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Decrease font size" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Alignment" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove background" })).toBeNull();
  });

  it("repeats font size while plus is held", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<EffectsToolbar layer={text} onChange={onChange} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Increase font size" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(onChange.mock.calls.length).toBeGreaterThan(1);
    const held = onChange.mock.calls.length;
    fireEvent.pointerUp(screen.getByRole("button", { name: "Increase font size" }));
    vi.advanceTimersByTime(400);
    expect(onChange).toHaveBeenCalledTimes(held);
    vi.useRealTimers();
  });

  it("left-aligns the alignment menu with the trigger", async () => {
    const user = userEvent.setup();
    render(<EffectsToolbar layer={text} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Alignment" }));
    const menu = screen.getByRole("menu");
    expect(menu.parentElement?.getAttribute("data-align")).toBe("start");
    expect(screen.getByRole("menuitem", { name: "Left" }).className).toMatch(/justify-start/);
  });

  it("steps font size up without scaling the box width", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EffectsToolbar layer={text} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Increase font size" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ fontSize: 17, width: 120, height: 17 * 1.2 }),
    );
  });

  it("shows photo controls and not font family", () => {
    render(<EffectsToolbar layer={photo} onChange={vi.fn()} />);
    expect(screen.queryByRole("combobox", { name: "Font family" })).toBeNull();
    expect(screen.getByLabelText("Corner radius")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove background" })).toBeTruthy();
  });

  it("toggles removeBackground off", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EffectsToolbar layer={photo} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Remove background" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", removeBackground: false }),
    );
  });
});
