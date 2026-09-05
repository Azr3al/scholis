import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseAwardsBoard } from "./course-awards-board";

const { getCourseAwards, deleteAwardGrant } = vi.hoisted(() => ({
  getCourseAwards: vi.fn(),
  deleteAwardGrant: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/awards-api", () => ({
  getCourseAwards,
  createAwardGrantBatch: vi.fn(),
  deleteAwardGrant,
  promoteAwardTitle: vi.fn(),
  getAwardDisplayTemplate: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/contexts/course-hub-context", () => ({
  useCourseHub: () => ({
    courseId: "7",
    course: {
      id: 7,
      title: "IG 19",
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    },
    isCourseLoading: false,
  }),
}));

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({ tenant: { timezone: "UTC" } }),
}));

vi.mock("@/components/primitives/toast", () => ({
  useToast: () => ({ add: vi.fn() }),
}));

vi.mock("@/app/client-api/user-images", () => ({
  fetchUserImageUrls: vi.fn().mockResolvedValue({ urls: {}, sources: {} }),
}));

vi.mock("@/lib/awards/course-main-teacher", () => ({
  fetchCourseMainTeacher: vi.fn().mockResolvedValue({ name: "", signatureUrl: null }),
}));

function renderBoard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CourseAwardsBoard />
    </QueryClientProvider>,
  );
}

const emptyPicker = { pinned: [], top10: [], local: [], other: [] };

const twoGrants = {
  students: [
    {
      id: 1,
      name: "Hla Hla",
      grants: [
        {
          id: 9,
          title: {
            id: 1,
            name: "Top 1",
            family: null,
            origin: "admin",
            is_pinned: true,
            display_template: null,
          },
        },
      ],
    },
    {
      id: 2,
      name: "Kyaw Thu",
      grants: [
        {
          id: 10,
          title: {
            id: 2,
            name: "Perfect Attendance",
            family: null,
            origin: "admin",
            is_pinned: false,
            display_template: null,
          },
        },
      ],
    },
  ],
  picker: emptyPicker,
};

describe("CourseAwardsBoard", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    getCourseAwards.mockReset();
    deleteAwardGrant.mockReset();
    deleteAwardGrant.mockResolvedValue(undefined);
  });
  it("shows empty copy and Grant award when no grants exist, in both views", async () => {
    getCourseAwards.mockResolvedValue({
      students: [{ id: 1, name: "Hla Hla", grants: [] }],
      picker: emptyPicker,
    });
    renderBoard();
    expect(await screen.findByText(/this period/i)).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Grant award" }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Hla Hla")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "List" }));
    expect(screen.queryByText("Hla Hla")).toBeNull();
  });

  it("omits students without grants after the first grant", async () => {
    getCourseAwards.mockResolvedValue({
      students: [
        {
          id: 1,
          name: "Hla Hla",
          grants: [
            {
              id: 9,
              title: {
                id: 1,
                name: "Top 1",
                family: null,
                origin: "admin",
                is_pinned: true,
                display_template: null,
              },
            },
          ],
        },
        { id: 2, name: "Kyaw Thu", grants: [] },
      ],
      picker: emptyPicker,
    });
    renderBoard();
    expect(await screen.findByText("Hla Hla")).toBeTruthy();
    expect(screen.queryByText("Kyaw Thu")).toBeNull();
  });

  it("opens the composer from Grant award, not a dialog", async () => {
    getCourseAwards.mockResolvedValue({
      students: [{ id: 1, name: "Hla Hla", grants: [] }],
      picker: emptyPicker,
    });
    renderBoard();
    const grantButtons = await screen.findAllByRole("button", {
      name: "Grant award",
    });
    await userEvent.click(grantButtons[0]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/Award title/i)).toBeTruthy();
  });

  it("omits Download all on the empty state", async () => {
    getCourseAwards.mockResolvedValue({
      students: [{ id: 1, name: "Hla Hla", grants: [] }],
      picker: emptyPicker,
    });
    renderBoard();
    await screen.findAllByRole("button", { name: "Grant award" });
    expect(screen.queryByRole("button", { name: "Download all" })).toBeNull();
  });

  it("does not delete until the confirm dialog is accepted", async () => {
    const user = userEvent.setup();
    getCourseAwards.mockResolvedValue(twoGrants);
    renderBoard();
    await screen.findByText("Hla Hla");

    await user.click(screen.getByRole("button", { name: "Remove Top 1" }));
    expect(deleteAwardGrant).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Remove Top 1/ })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteAwardGrant).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Remove Top 1" }));
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => {
      expect(deleteAwardGrant).toHaveBeenCalledWith(9);
    });
  });

  it("confirms delete from list view with the same dialog", async () => {
    const user = userEvent.setup();
    getCourseAwards.mockResolvedValue(twoGrants);
    renderBoard();
    await screen.findByText("Hla Hla");
    await user.click(screen.getByRole("button", { name: "List" }));
    await screen.findByText("Awards this period");

    await user.click(screen.getByRole("button", { name: "Remove Top 1" }));
    expect(deleteAwardGrant).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog")).toBeTruthy();

    await user.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => {
      expect(deleteAwardGrant).toHaveBeenCalledWith(9);
    });
  });

  it("filters gallery and list by student name or award title", async () => {
    const user = userEvent.setup();
    getCourseAwards.mockResolvedValue(twoGrants);
    renderBoard();
    await screen.findByText("Hla Hla");

    const search = screen.getByRole("searchbox", {
      name: "Search students or awards",
    });
    await user.type(search, "Kyaw");
    expect(screen.getByText("Kyaw Thu")).toBeTruthy();
    expect(screen.queryByText("Hla Hla")).toBeNull();

    await user.clear(search);
    await user.type(search, "Top");
    expect(screen.getByText("Hla Hla")).toBeTruthy();
    expect(screen.queryByText("Kyaw Thu")).toBeNull();

    await user.click(screen.getByRole("button", { name: "List" }));
    await screen.findByText("Awards this period");
    expect(screen.getByText("Hla Hla")).toBeTruthy();
    expect(screen.queryByText("Kyaw Thu")).toBeNull();

    await user.clear(search);
    await user.type(search, "zzzz");
    expect(await screen.findByText("No matching awards.")).toBeTruthy();
    expect(screen.queryByText("Hla Hla")).toBeNull();
  });
});
