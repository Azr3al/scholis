import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockTenantMicrosoftOn, mockToastAdd } = vi.hoisted(() => ({
  mockTenantMicrosoftOn: { current: true },
  mockToastAdd: vi.fn(),
}));

vi.mock("@/hooks/useTenant", () => ({
  useTenant: () => ({
    tenant: { is_microsoft_on: mockTenantMicrosoftOn.current },
  }),
}));

vi.mock("@/hooks/useUser", () => ({
  useUser: () => ({ user: { id: 1 } }),
}));

vi.mock("@/components/primitives/toast", () => ({
  useToast: () => ({ add: mockToastAdd }),
}));

vi.mock("@/app/client-api/utils", () => ({
  makePostRequest: vi.fn(),
  searchEntities: vi.fn(() =>
    Promise.resolve({ data: { data: [] } }),
  ),
}));

vi.mock("@tiptap/react", () => ({
  useEditor: () => ({
    getHTML: () => "<p></p>",
    setOptions: vi.fn(),
    options: { editorProps: {} },
  }),
}));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: { children?: ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
  useReducedMotion: () => true,
}));

vi.mock("../editor/editor", () => ({
  default: () => <div data-testid="text-editor" />,
}));

vi.mock("../attachment-uploader/attachment-uploader", () => ({
  default: () => null,
}));

vi.mock("../form/entity-combobox", () => ({
  default: ({
    label,
    onChange,
    onSelectedEntityChange,
  }: {
    label: string;
    onChange?: (value: string) => void;
    onSelectedEntityChange?: (entity: { id: number; title: string } | null) => void;
  }) => {
    const mockCourse = { id: 42, title: "Course 42" };
    return (
      <div>
        <div>{label}</div>
        <button
          type="button"
          onClick={() => {
            onChange?.(String(mockCourse.id));
            onSelectedEntityChange?.(mockCourse);
          }}
        >
          Add mock course
        </button>
      </div>
    );
  },
}));

vi.mock("../form/multi-select-popover", () => ({
  default: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock("../misc/generic-dialog", () => ({
  default: ({
    open,
    onConfirm,
  }: {
    open: boolean;
    onConfirm?: () => void;
  }) =>
    open ? (
      <button type="button" onClick={onConfirm}>
        Confirm Teams send
      </button>
    ) : null,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { makePostRequest } from "@/app/client-api/utils";
import { AnnouncementCreationCenterForm } from "./announcement-creation-center-form";

function renderForm(props?: { onCancel?: () => void }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementCreationCenterForm
        cancelHref="/content/announcement-center"
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("AnnouncementCreationCenterForm", () => {
  afterEach(() => {
    cleanup();
    mockTenantMicrosoftOn.current = true;
    mockToastAdd.mockReset();
    vi.mocked(makePostRequest).mockReset();
  });

  beforeEach(() => {
    mockTenantMicrosoftOn.current = true;
  });

  it("shows Teams month and category controls for org-wide scope when Microsoft is on", () => {
    renderForm();

    expect(screen.getByText("Filter by category")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Send to MS Teams" })).toBeTruthy();
  });

  it("hides Teams month and category controls when Microsoft is off", () => {
    mockTenantMicrosoftOn.current = false;
    renderForm();

    expect(screen.queryByText("Filter by category")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Send to MS Teams" })).toBeNull();
  });

  it("hides Teams month and category controls for per-course scope even when Microsoft is on", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("radio", { name: "Per course" }));

    expect(screen.getAllByText("Courses").length).toBeGreaterThan(0);
    expect(screen.queryByText("Filter by category")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Send to MS Teams" })).toBeTruthy();
  });

  it("blocks per-course submit without a selected course", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("radio", { name: "Per course" }));
    await user.type(
      screen.getByPlaceholderText("Announcement Title"),
      "Test title",
    );
    await user.click(
      screen.getByRole("button", { name: /create announcement/i }),
    );

    expect(mockToastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        description:
          "Select at least one course before creating the announcement.",
      }),
    );
    expect(makePostRequest).not.toHaveBeenCalled();
  });

  it("shows a chip after selecting a per-course course", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("radio", { name: "Per course" }));
    await user.click(screen.getByRole("button", { name: "Add mock course" }));

    expect(screen.getByText("Course 42")).toBeTruthy();
    expect(screen.queryByText("None selected yet.")).toBeNull();
  });

  it("posts to announcements/batch when per-course courses are selected", async () => {
    const user = userEvent.setup();
    vi.mocked(makePostRequest).mockResolvedValue({
      data: {
        data: {
          created: [{ id: 1, course_id: 42 }],
          failed: [],
        },
      },
    });
    renderForm();

    await user.click(screen.getByRole("radio", { name: "Per course" }));
    await user.click(screen.getByRole("button", { name: "Add mock course" }));
    await user.type(
      screen.getByPlaceholderText("Announcement Title"),
      "Test title",
    );
    await user.click(
      screen.getByRole("button", { name: /create announcement/i }),
    );

    expect(makePostRequest).toHaveBeenCalledWith(
      "announcements/batch",
      expect.any(FormData),
      {},
      {},
    );
    const formData = vi.mocked(makePostRequest).mock.calls[0]?.[1] as FormData;
    expect(formData.get("course_ids")).toBe("[42]");
  });

  it("opens Teams confirm before org-wide send when checkbox is checked", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(
      screen.getByPlaceholderText("Announcement Title"),
      "Teams notice",
    );
    await user.click(screen.getByRole("checkbox", { name: "Send to MS Teams" }));
    await user.click(
      screen.getByRole("button", { name: /create & send to ms teams/i }),
    );

    expect(screen.getByRole("button", { name: "Confirm Teams send" })).toBeTruthy();
  });
});
