import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectedTextInspector } from "./selected-text-inspector";
import type { Layer } from "@/lib/image-template/types";

afterEach(cleanup);

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
};

describe("SelectedTextInspector", () => {
  it("edits copy through the template editor", () => {
    const onChange = vi.fn();
    render(<SelectedTextInspector layer={text} onChange={onChange} />);
    const box = screen.getByRole("textbox", { name: "Add text" });
    fireEvent.change(box, { target: { value: "Hello there" } });
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0] as Layer;
    expect(last.type).toBe("text");
    if (last.type !== "text") return;
    expect(last.text).toBe("Hello there");
  });

  it("edits a named person template string", () => {
    const onChange = vi.fn();
    const person: Layer = {
      id: "n1",
      type: "named_person",
      user_id: 7,
      x: 0,
      y: 0,
      width: 120,
      height: 32,
      z: 0,
    };
    render(<SelectedTextInspector layer={person} onChange={onChange} />);
    expect(screen.getByTestId("token-chip-named_person")).toBeTruthy();
    const box = screen.getByRole("textbox", { name: "Add text" });
    fireEvent.change(box, { target: { value: "This award is for " } });
    const last = onChange.mock.calls.at(-1)?.[0] as Layer;
    expect(last.type).toBe("named_person");
    if (last.type !== "named_person") return;
    expect(last.template).toContain("This award is for");
    expect(last.template).toContain("{{named_person}}");
  });
});
