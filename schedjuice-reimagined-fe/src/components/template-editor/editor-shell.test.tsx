import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorShell } from "./editor-shell";

afterEach(cleanup);

const shellProps = {
  section: "Award titles",
  title: "Untitled",
  backHref: "/award-titles/1/edit",
  onBack: () => {},
  onSave: () => {},
  showPhoto: true,
  fieldItems: [{ key: "student_name", label: "Student name" }],
  onAdd: vi.fn(),
  onTitleChange: vi.fn(),
  inspector: null,
  layers: null,
};

describe("EditorShell", () => {
  it("uses a text Back control, not a home icon", () => {
    render(
      <EditorShell {...shellProps}>
        <div />
      </EditorShell>,
    );
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe(
      "/award-titles/1/edit",
    );
    expect(screen.queryByLabelText("Home")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("commits an edited template name on blur", async () => {
    const user = userEvent.setup();
    const onTitleChange = vi.fn();
    render(
      <EditorShell {...shellProps} onTitleChange={onTitleChange}>
        <div />
      </EditorShell>,
    );
    await user.click(screen.getByRole("button", { name: "Template name" }));
    const input = screen.getByRole("textbox", { name: "Template name" });
    await user.clear(input);
    await user.type(input, "May");
    await user.tab();
    expect(onTitleChange).toHaveBeenCalledWith("May");
  });

  it("keeps the section label visible while the name is being edited", async () => {
    const user = userEvent.setup();
    render(
      <EditorShell {...shellProps}>
        <div />
      </EditorShell>,
    );
    await user.click(screen.getByRole("button", { name: "Template name" }));
    expect(screen.getByText("Award titles")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Template name" })).toBeTruthy();
    expect(screen.getByTestId("template-name-slot").className).toMatch(/max-w-/);
  });

  it("left-aligns the template name", () => {
    render(
      <EditorShell {...shellProps}>
        <div />
      </EditorShell>,
    );
    expect(screen.getByRole("button", { name: "Template name" }).className).toMatch(
      /text-left/,
    );
  });

  it("uses an image icon for signature fields and a hashtag for text fields", async () => {
    const user = userEvent.setup();
    render(
      <EditorShell
        {...shellProps}
        fieldItems={[
          { key: "student_name", label: "Student name", visual: "text" },
          { key: "mt_signature", label: "MT signature", visual: "image" },
        ]}
      >
        <div />
      </EditorShell>,
    );
    await user.click(screen.getByRole("button", { name: "Fields" }));
    expect(screen.getByTestId("field-item-student_name").getAttribute("data-field-visual")).toBe(
      "text",
    );
    expect(screen.getByTestId("field-item-mt_signature").getAttribute("data-field-visual")).toBe(
      "image",
    );
  });

  it("hides Preview when onPreview is omitted", () => {
    render(
      <EditorShell {...shellProps}>
        <div />
      </EditorShell>,
    );
    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("calls onPreview once from the Preview button", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    render(
      <EditorShell {...shellProps} onPreview={onPreview}>
        <div />
      </EditorShell>,
    );
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it("exposes insert actions as icon buttons", () => {
    render(
      <EditorShell {...shellProps}>
        <div />
      </EditorShell>,
    );
    expect(screen.getByRole("button", { name: "Text" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Photo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fields" })).toBeTruthy();
  });

  it("restores Untitled when the name is cleared", async () => {
    const user = userEvent.setup();
    const onTitleChange = vi.fn();
    render(
      <EditorShell {...shellProps} title="May" onTitleChange={onTitleChange}>
        <div />
      </EditorShell>,
    );
    await user.click(screen.getByRole("button", { name: "Template name" }));
    await user.clear(screen.getByRole("textbox", { name: "Template name" }));
    await user.tab();
    expect(onTitleChange).toHaveBeenCalledWith("Untitled");
  });
});
