import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { TemplateCopyEditor } from "./template-copy-editor";

afterEach(cleanup);

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <TemplateCopyEditor value={value} onChange={setValue} />;
}

describe("TemplateCopyEditor", () => {
  it("keeps spaces typed between words", async () => {
    const user = userEvent.setup();
    render(<Harness initial="" />);
    await user.type(screen.getByRole("textbox", { name: "Add text" }), "Hi there");
    expect((screen.getByRole("textbox", { name: "Add text" }) as HTMLInputElement).value).toBe(
      "Hi there",
    );
  });

  it("inserts a variable from the { suggestion list", async () => {
    const user = userEvent.setup();
    render(<Harness initial="Hello " />);
    await user.type(screen.getByRole("textbox", { name: "Add text" }), "{{stu");
    expect(await screen.findByRole("option", { name: /Student name/i })).toBeTruthy();
    await user.click(screen.getByRole("option", { name: /Student name/i }));
    expect(screen.getByTestId("token-chip-student_name")).toBeTruthy();
  });
});
