import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecurringSlot } from "@/types/intake";
import { SlotsSimpleScheduleField } from "./slots-simple-schedule-field";

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({
    tenant: {
      is_wd_we_course_types_enabled: true,
      default_session_start_time: "19:00",
      default_session_duration_minutes: 90,
      timezone: null,
    },
    isLoading: false,
    refetchTenant: vi.fn(),
  }),
}));

afterEach(() => cleanup());

function Harness({ initial = [] as RecurringSlot[] }) {
  const [slots, setSlots] = useState(initial);
  return (
    <div>
      <SlotsSimpleScheduleField slots={slots} onChange={setSlots} />
      <pre data-testid="slots">{JSON.stringify(slots)}</pre>
    </div>
  );
}

async function pickFromHour(user: ReturnType<typeof userEvent.setup>, hour: string) {
  const openers = screen.getAllByRole("button", { name: /open time picker/i });
  await user.click(openers[0]!);
  const hours = screen.getByRole("listbox", { name: /hours/i });
  await user.click(within(hours).getByRole("option", { name: hour }));
}

describe("SlotsSimpleScheduleField", () => {
  it("keeps a time change when no weekdays are selected yet", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await pickFromHour(user, "8");

    const fromHour = screen.getAllByRole("spinbutton", { name: /hour/i })[0];
    expect(fromHour?.textContent).toMatch(/8/);
  });

  it("persists time into slots after WD is selected", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "WD" }));
    await pickFromHour(user, "8");

    const dumped = screen.getByTestId("slots").textContent ?? "";
    expect(dumped).toContain('"time_from":"20:00"');
  });
});
