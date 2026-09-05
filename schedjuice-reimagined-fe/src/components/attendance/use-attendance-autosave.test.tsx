import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { updateEntities } from "@/app/client-api/utils";
import { attendanceStatus, type attendanceType } from "@/types/attendance";
import { useAttendanceAutosave } from "./use-attendance-autosave";

vi.mock("@/app/client-api/utils", () => ({
  updateEntities: vi.fn(),
}));

function makeAttendance(id: number): attendanceType {
  return {
    id,
    user: {
      id: id * 10,
      name: `Student ${id}`,
      email: `student${id}@example.com`,
      alternative_name: null,
      phone_number: null,
    } as unknown as attendanceType["user"],
    event: {
      id: 99,
      date: "2026-06-08",
      course_id: 1,
    } as attendanceType["event"],
    attendance_status: attendanceStatus.unregistered,
    attendance_note: null,
    checkin_time: null,
    checkout_time: null,
    checkin_image: null,
    is_extra_class: false,
    today_activities: null,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useAttendanceAutosave rowStates for status", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (updateEntities as Mock).mockResolvedValue({});
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("sets pending → saving → saved for a status dirty row", async () => {
    const row = makeAttendance(1);
    const attendancesRef = { current: [row] };
    const dirtyIdsRef = { current: [1] as number[] };
    const onDirtyClear = vi.fn((ids: number[]) => {
      dirtyIdsRef.current = dirtyIdsRef.current.filter(
        (id) => !ids.includes(id),
      );
    });

    const { result, rerender } = renderHook(
      (props: {
        dirtyIds: number[];
        dirtyRevision: number;
        dirtyKindByRow: Record<number, "status" | "note">;
      }) =>
        useAttendanceAutosave({
          attendances: attendancesRef.current,
          attendancesRef,
          dirtyIds: props.dirtyIds,
          dirtyIdsRef,
          dirtyRevision: props.dirtyRevision,
          dirtyEditKind: "status",
          dirtyKindByRow: props.dirtyKindByRow,
          enabled: true,
          onDirtyClear,
        }),
      {
        wrapper,
        initialProps: {
          dirtyIds: [] as number[],
          dirtyRevision: 0,
          dirtyKindByRow: {} as Record<number, "status" | "note">,
        },
      },
    );

    expect(result.current.rowStates[1]).toBeUndefined();

    await act(async () => {
      dirtyIdsRef.current = [1];
      attendancesRef.current = [
        { ...row, attendance_status: attendanceStatus.present },
      ];
      rerender({
        dirtyIds: [1],
        dirtyRevision: 1,
        dirtyKindByRow: { 1: "status" },
      });
    });

    expect(result.current.rowStates[1]).toBe("pending");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    await waitFor(() => {
      expect(result.current.rowStates[1]).toBe("saved");
    });

    expect(updateEntities).toHaveBeenCalled();
    expect(onDirtyClear).toHaveBeenCalledWith([1]);
  });
});
