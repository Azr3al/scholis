import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SimpleScheduleValue } from "@/helpers/simple-schedule";
import { SimpleSchedulePicker } from "./simple-schedule-picker";

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({ tenant: null, isLoading: false, refetchTenant: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

const base: SimpleScheduleValue = {
  weekdays: [],
  time_from: "19:00",
  time_to: "20:30",
  course_type: null,
};

describe("SimpleSchedulePicker", () => {
  it("shows weekday chips by default", () => {
    render(
      <SimpleSchedulePicker
        value={base}
        onChange={() => {}}
        useWdWeNomenclature={false}
        mode="simple"
        onModeChange={() => {}}
        renderCustom={() => <div>CUSTOM</div>}
      />,
    );
    expect(screen.getByRole("button", { name: "Mon" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "WD" })).toBeNull();
  });

  it("shows WD/WE when nomenclature enabled", () => {
    render(
      <SimpleSchedulePicker
        value={base}
        onChange={() => {}}
        useWdWeNomenclature
        mode="simple"
        onModeChange={() => {}}
        renderCustom={() => <div>CUSTOM</div>}
      />,
    );
    expect(screen.getByRole("button", { name: "WD" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "WE" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mon" })).toBeNull();
  });

  it("switches to custom", () => {
    const onModeChange = vi.fn();
    render(
      <SimpleSchedulePicker
        value={base}
        onChange={() => {}}
        useWdWeNomenclature={false}
        mode="simple"
        onModeChange={onModeChange}
        renderCustom={() => <div>CUSTOM</div>}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /custom schedule/i }));
    expect(onModeChange).toHaveBeenCalledWith("custom");
  });

  it("hides custom schedule when allowCustomMode is false", () => {
    render(
      <SimpleSchedulePicker
        value={base}
        onChange={() => {}}
        useWdWeNomenclature={false}
        allowCustomMode={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /custom schedule/i }),
    ).toBeNull();
  });

  it("shows · optional on Days/From/To when fieldMarks is optional", () => {
    render(
      <SimpleSchedulePicker
        value={base}
        onChange={() => {}}
        useWdWeNomenclature={false}
        mode="simple"
        onModeChange={() => {}}
        renderCustom={() => <div>CUSTOM</div>}
        fieldMarks="optional"
      />,
    );
    expect(screen.getAllByText(/· optional/).length).toBeGreaterThanOrEqual(3);
  });

  it("shows required marks on Days/From/To when fieldMarks is required", () => {
    const { container } = render(
      <SimpleSchedulePicker
        value={base}
        onChange={() => {}}
        useWdWeNomenclature={false}
        mode="simple"
        onModeChange={() => {}}
        renderCustom={() => <div>CUSTOM</div>}
        fieldMarks="required"
      />,
    );
    expect(container.textContent).toMatch(/\*/);
    expect(screen.queryByText(/· optional/)).toBeNull();
  });

  it("hides field marks by default", () => {
    render(
      <SimpleSchedulePicker
        value={base}
        onChange={() => {}}
        useWdWeNomenclature={false}
        mode="simple"
        onModeChange={() => {}}
        renderCustom={() => <div>CUSTOM</div>}
      />,
    );
    expect(screen.queryByText(/· optional/)).toBeNull();
  });
});
