import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AwardDocument } from "@/lib/image-template/types";
import type { ReactNode } from "react";

const { makeGetRequest, searchEntities, fetchUserImageUrls, composite } = vi.hoisted(
  () => ({
    makeGetRequest: vi.fn(),
    searchEntities: vi.fn(),
    fetchUserImageUrls: vi.fn(),
    composite: vi.fn(),
  }),
);

vi.mock("@/app/client-api/utils", () => ({
  makeGetRequest,
  searchEntities,
}));

vi.mock("@/app/client-api/user-images", () => ({
  fetchUserImageUrls,
}));

vi.mock("@/lib/image-template/composite", () => ({
  composite,
}));

vi.mock("@/components/form/entity-combobox", () => ({
  default: function MockCoursePicker({
    value,
    onChange,
    onSelectedEntityChange,
  }: {
    value?: string;
    onChange?: (value: string) => void;
    onSelectedEntityChange?: (entity: { id: number; title: string } | null) => void;
  }) {
    return (
      <div>
        <span data-testid="course-value">{value || ""}</span>
        <button
          type="button"
          onClick={() => {
            onChange?.("9");
            onSelectedEntityChange?.({ id: 9, title: "Year 10 Maths" });
          }}
        >
          Pick course
        </button>
        <button
          type="button"
          onClick={() => {
            onChange?.("");
            onSelectedEntityChange?.(null);
          }}
        >
          Clear course
        </button>
      </div>
    );
  },
}));

import { AwardPreviewDialog } from "./award-preview-dialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const document: AwardDocument = {
  version: 1,
  kind: "award",
  unit: "px",
  width: 200,
  height: 120,
  pagePreset: "custom",
  background: { url: null, offsetX: 0, offsetY: 0, scale: 1 },
  layers: [],
};

function renderDialog(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("AwardPreviewDialog", () => {
  beforeEach(() => {
    fetchUserImageUrls.mockResolvedValue({ urls: {}, sources: {} });
    searchEntities.mockResolvedValue({ data: { data: [] } });
    composite.mockResolvedValue({ toDataURL: () => "data:image/png;base64,aaa" });
  });

  it("composites variable tokens when no course is selected", async () => {
    renderDialog(
      <AwardPreviewDialog
        open
        onOpenChange={vi.fn()}
        document={document}
        awardTitle="Top 1"
      />,
    );
    await waitFor(() => expect(composite).toHaveBeenCalled());
    expect(composite.mock.calls[0]?.[2]).toEqual({ tokens: true });
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.getByTestId("course-value").textContent).toBe("");
  });

  it("shows an empty roster and keeps token preview", async () => {
    const user = userEvent.setup();
    makeGetRequest.mockResolvedValue({ data: { data: [] } });
    renderDialog(
      <AwardPreviewDialog
        open
        onOpenChange={vi.fn()}
        document={document}
        awardTitle="Top 1"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Pick course" }));
    expect(await screen.findByText("No students in this course")).toBeTruthy();
    await waitFor(() =>
      expect(composite.mock.calls.some((call) => call[2]?.tokens === true)).toBe(true),
    );
  });

  it("highlights the selected student and recomposites the next one", async () => {
    const user = userEvent.setup();
    makeGetRequest.mockResolvedValue({
      data: {
        data: [
          { id: 1, name: "Alex" },
          { id: 2, name: "Jordan" },
        ],
      },
    });
    renderDialog(
      <AwardPreviewDialog
        open
        onOpenChange={vi.fn()}
        document={document}
        awardTitle="Top 1"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Pick course" }));
    expect(screen.getByTestId("course-value").textContent).toBe("9");
    const alex = await screen.findByRole("option", { name: "Alex" });
    expect(alex.getAttribute("data-selected")).toBe("true");
    expect(alex.getAttribute("aria-selected")).toBe("true");
    await waitFor(() =>
      expect(composite.mock.calls.some((call) => call[2]?.tokens === false)).toBe(true),
    );
    expect(
      composite.mock.calls.find((call) => call[2]?.tokens === false)?.[1]?.studentName,
    ).toBe("Alex");
    await user.click(screen.getByRole("option", { name: "Jordan" }));
    expect(screen.getByRole("option", { name: "Jordan" }).getAttribute("data-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("option", { name: "Alex" }).getAttribute("data-selected")).toBe(
      "false",
    );
    await waitFor(() =>
      expect(composite.mock.calls.some((call) => call[1]?.studentName === "Jordan")).toBe(
        true,
      ),
    );
  });

  it("binds the course main teacher name into the composite", async () => {
    const user = userEvent.setup();
    makeGetRequest.mockResolvedValue({
      data: { data: [{ id: 1, name: "Kyaw Thu" }] },
    });
    searchEntities.mockResolvedValue({
      data: {
        data: [
          {
            user: {
              name: "admin",
              user_signature_url: "https://cdn.example/mt.png",
            },
          },
        ],
      },
    });
    renderDialog(
      <AwardPreviewDialog
        open
        onOpenChange={vi.fn()}
        document={document}
        awardTitle="Top 1"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Pick course" }));
    await waitFor(() =>
      expect(
        composite.mock.calls.some(
          (call) =>
            call[1]?.mtName === "admin" &&
            call[1]?.mtSignatureUrl === "https://cdn.example/mt.png",
        ),
      ).toBe(true),
    );
    expect(searchEntities).toHaveBeenCalledWith(
      "user-courses",
      expect.objectContaining({ expand: ["user", "assigned_as_role"] }),
      expect.objectContaining({
        filter_params: expect.arrayContaining([
          expect.objectContaining({ field_name: "course_id", value: "9" }),
          expect.objectContaining({
            field_name: "assigned_as_role__seniority",
            value: "MAIN_TEACHER",
          }),
        ]),
      }),
    );
  });

  it("leaves mt name empty when the course has no main teacher", async () => {
    const user = userEvent.setup();
    makeGetRequest.mockResolvedValue({
      data: { data: [{ id: 1, name: "Kyaw Thu" }] },
    });
    searchEntities.mockResolvedValue({ data: { data: [] } });
    renderDialog(
      <AwardPreviewDialog
        open
        onOpenChange={vi.fn()}
        document={document}
        awardTitle="Top 1"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Pick course" }));
    await waitFor(() =>
      expect(composite.mock.calls.some((call) => call[2]?.tokens === false)).toBe(
        true,
      ),
    );
    expect(
      composite.mock.calls.find((call) => call[2]?.tokens === false)?.[1]?.mtName,
    ).toBe("");
  });

  it("clears the course and students when closed", async () => {
    const user = userEvent.setup();
    makeGetRequest.mockResolvedValue({
      data: { data: [{ id: 1, name: "Alex" }] },
    });
    const onOpenChange = vi.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = (open: boolean) => (
      <QueryClientProvider client={client}>
        <AwardPreviewDialog
          open={open}
          onOpenChange={onOpenChange}
          document={document}
          awardTitle="Top 1"
        />
      </QueryClientProvider>
    );
    const { rerender } = render(view(true));
    await user.click(screen.getByRole("button", { name: "Pick course" }));
    expect(await screen.findByRole("option", { name: "Alex" })).toBeTruthy();
    rerender(view(false));
    rerender(view(true));
    expect(screen.getByTestId("course-value").textContent).toBe("");
    expect(screen.queryByRole("option", { name: "Alex" })).toBeNull();
  });
});
