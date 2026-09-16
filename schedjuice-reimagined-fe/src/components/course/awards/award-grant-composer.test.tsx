import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { AwardBoardStudent, AwardPickerGroups } from "@/types/award";
import { AwardGrantComposer } from "./award-grant-composer";

const {
  getAwardDisplayTemplate,
  composite,
  fetchUserImageUrls,
  fetchCourseMainTeacher,
  scrollElementToViewportRatio,
  restoreMainContentViewportAnchor,
} = vi.hoisted(() => ({
  getAwardDisplayTemplate: vi.fn().mockResolvedValue(null),
  composite: vi.fn(),
  fetchUserImageUrls: vi.fn().mockResolvedValue({ urls: {}, sources: {} }),
  fetchCourseMainTeacher: vi
    .fn()
    .mockResolvedValue({ name: "", signatureUrl: null }),
  scrollElementToViewportRatio: vi.fn(),
  restoreMainContentViewportAnchor: vi.fn(),
}));

vi.mock("@/lib/awards-api", () => ({
  getAwardDisplayTemplate,
}));

vi.mock("@/lib/image-template/composite", () => ({
  composite,
}));

vi.mock("@/app/client-api/user-images", () => ({
  fetchUserImageUrls,
}));

vi.mock("@/lib/awards/course-main-teacher", () => ({
  fetchCourseMainTeacher,
}));

vi.mock("@/lib/main-content-scroll", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/main-content-scroll")>();
  return {
    ...actual,
    scrollElementToViewportRatio,
    restoreMainContentViewportAnchor,
  };
});

const top1 = {
  id: 1,
  name: "Top 1",
  family: null,
  origin: "admin" as const,
  is_pinned: true,
  has_display_template: false,
};

const attendance = {
  id: 2,
  name: "Attendance",
  family: null,
  origin: "admin" as const,
  is_pinned: false,
  has_display_template: false,
};

const picker: AwardPickerGroups = {
  pinned: [top1],
  top10: [attendance],
  local: [],
  other: [],
};

const roster: AwardBoardStudent[] = [
  { id: 11, name: "Hla Hla", grants: [] },
  { id: 12, name: "Kyaw Thu", grants: [] },
];

function composerProps(
  overrides: Partial<ComponentProps<typeof AwardGrantComposer>> = {},
): ComponentProps<typeof AwardGrantComposer> {
  return {
    open: true,
    courseId: 7,
    periodLabel: "Aug 2026",
    students: roster,
    picker,
    orgTitles: [top1, attendance],
    localTitles: [],
    precheckedIds: [],
    pending: false,
    onCancel: () => {},
    onGrant: async () => ({ granted: [], errors: [] }),
    ...overrides,
  };
}

function renderComposer(
  overrides: Partial<ComponentProps<typeof AwardGrantComposer>> = {},
) {
  return render(<AwardGrantComposer {...composerProps(overrides)} />);
}

async function pickTitle(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("combobox", { name: /award title/i }));
  await user.click(await screen.findByRole("option", { name }));
}

describe("AwardGrantComposer", () => {
  afterEach(() => {
    cleanup();
    getAwardDisplayTemplate.mockReset();
    getAwardDisplayTemplate.mockResolvedValue(null);
    composite.mockReset();
    fetchUserImageUrls.mockReset();
    fetchUserImageUrls.mockResolvedValue({ urls: {}, sources: {} });
    fetchCourseMainTeacher.mockReset();
    fetchCourseMainTeacher.mockResolvedValue({ name: "", signatureUrl: null });
    scrollElementToViewportRatio.mockReset();
    restoreMainContentViewportAnchor.mockReset();
  });

  it("does not render a dialog role", () => {
    renderComposer({ precheckedIds: [11] });
    expect(screen.queryByRole("dialog")).toBeNull();
    const box = screen.getByRole("checkbox", { name: "Hla Hla" });
    expect(box.getAttribute("aria-checked")).toBe("true");
  });

  it("shows per-student batch errors and disables Grant until a title and a student", async () => {
    const user = userEvent.setup();
    const onGrant = vi.fn().mockResolvedValue({
      granted: [{ id: 1, user: 11, title: { id: 1, name: "Top 1" } }],
      errors: [
        {
          user: 12,
          message:
            "This student already has Top 1 in the same family for this period.",
        },
      ],
    });
    renderComposer({ onGrant });

    const grant = screen.getByRole("button", { name: "Grant" }) as HTMLButtonElement;
    expect(grant.disabled).toBe(true);

    await pickTitle(user, "Top 1");
    expect(grant.disabled).toBe(true);

    await user.click(screen.getByRole("checkbox", { name: "Hla Hla" }));
    await user.click(screen.getByRole("checkbox", { name: "Kyaw Thu" }));
    expect(grant.disabled).toBe(false);

    await user.click(grant);
    expect(onGrant).toHaveBeenCalledWith({
      title_id: 1,
      name: undefined,
      user_ids: [11, 12],
    });
    expect(
      await screen.findByText(
        "This student already has Top 1 in the same family for this period.",
      ),
    ).toBeTruthy();
  });

  it("filters award titles in the combobox popup", async () => {
    const user = userEvent.setup();
    renderComposer();

    const title = screen.getByRole("combobox", { name: /award title/i });
    await user.click(title);
    expect(await screen.findByRole("option", { name: "Top 1" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Attendance" })).toBeTruthy();

    await user.type(title, "Top");
    expect(screen.getByRole("option", { name: "Top 1" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Attendance" })).toBeNull();
  });

  it("grants a typed title that is not in the catalog", async () => {
    const user = userEvent.setup();
    const onGrant = vi.fn().mockResolvedValue({ granted: [], errors: [] });
    renderComposer({ onGrant });

    await user.type(
      screen.getByRole("combobox", { name: /award title/i }),
      "Custom ribbon",
    );
    await user.click(
      await screen.findByRole("option", { name: /Create .*Custom ribbon/ }),
    );
    await user.click(screen.getByRole("checkbox", { name: "Hla Hla" }));
    await user.click(screen.getByRole("button", { name: "Grant" }));

    expect(onGrant).toHaveBeenCalledWith({
      title_id: null,
      name: "Custom ribbon",
      user_ids: [11],
    });
  });

  it("filters the roster without dropping checked students from the grant", async () => {
    const user = userEvent.setup();
    const onGrant = vi.fn().mockResolvedValue({ granted: [], errors: [] });
    renderComposer({ onGrant });

    await pickTitle(user, "Top 1");
    await user.click(screen.getByRole("checkbox", { name: "Hla Hla" }));
    await user.click(screen.getByRole("checkbox", { name: "Kyaw Thu" }));
    await user.type(
      screen.getByRole("searchbox", { name: "Search students" }),
      "Hla",
    );

    expect(screen.getByRole("checkbox", { name: "Hla Hla" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Kyaw Thu" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Grant" }));
    expect(onGrant).toHaveBeenCalledWith({
      title_id: 1,
      name: undefined,
      user_ids: [11, 12],
    });
  });

  it("shows empty copy when the student search matches nobody", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.type(
      screen.getByRole("searchbox", { name: "Search students" }),
      "zzzz",
    );

    expect(screen.getByText("No matching students.")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Hla Hla" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Kyaw Thu" })).toBeNull();
  });

  it("renders a large preview image when the title has a display template", async () => {
    const user = userEvent.setup();
    const titled = { ...top1, has_display_template: true };
    getAwardDisplayTemplate.mockResolvedValue({
      id: 9,
      name: "Cert",
      document: {},
      background_url: null,
    });
    composite.mockResolvedValue({
      toDataURL: () => "data:image/png;base64,preview",
    });
    renderComposer({
      picker: { ...picker, pinned: [titled] },
      orgTitles: [titled, attendance],
    });

    await pickTitle(user, "Top 1");
    const img = await screen.findByRole("img", { name: /Award preview/ });
    await waitFor(() => {
      expect(img.getAttribute("src")).toBe("data:image/png;base64,preview");
    });
    expect(img.className).not.toContain("max-h-32");
    const frame = document.querySelector("[data-slot='award-grant-preview']");
    expect(frame?.className).toMatch(/(?:^|\s)h-72(?:\s|$)/);
    expect(frame?.className).toMatch(/lg:h-112/);
    expect(frame?.className).toContain("overflow-hidden");
    expect(frame?.className).not.toContain("min-h-72");
    expect(img.className).toContain("absolute");
    expect(img.className).toContain("inset-0");
    expect(img.className).toContain("object-contain");
  });

  it("binds the checked student's award photo into the preview composite", async () => {
    const user = userEvent.setup();
    const titled = { ...top1, has_display_template: true };
    getAwardDisplayTemplate.mockResolvedValue({
      id: 9,
      name: "Cert",
      document: {},
      background_url: null,
    });
    composite.mockResolvedValue({
      toDataURL: () => "data:image/png;base64,preview",
    });
    fetchUserImageUrls.mockResolvedValue({
      urls: { "11": "https://cdn.example/hla.png" },
      sources: { "11": "user_image" },
    });
    renderComposer({
      picker: { ...picker, pinned: [titled] },
      orgTitles: [titled, attendance],
      precheckedIds: [11],
    });

    await pickTitle(user, "Top 1");
    await waitFor(() => {
      expect(fetchUserImageUrls).toHaveBeenCalledWith([11], "award_image");
    });
    await waitFor(() => {
      expect(
        composite.mock.calls.some(
          (call) => call[1]?.awardImageUrl === "https://cdn.example/hla.png",
        ),
      ).toBe(true);
    });
    expect(
      composite.mock.calls.find(
        (call) => call[1]?.awardImageUrl === "https://cdn.example/hla.png",
      )?.[1]?.studentName,
    ).toBe("Hla Hla");
  });

  it("binds the course main teacher signature into the preview composite", async () => {
    const user = userEvent.setup();
    const titled = { ...top1, has_display_template: true };
    getAwardDisplayTemplate.mockResolvedValue({
      id: 9,
      name: "Cert",
      document: {},
      background_url: null,
    });
    composite.mockResolvedValue({
      toDataURL: () => "data:image/png;base64,preview",
    });
    fetchCourseMainTeacher.mockResolvedValue({
      name: "Daw Su",
      signatureUrl: "https://cdn.example/mt.png",
    });
    renderComposer({
      picker: { ...picker, pinned: [titled] },
      orgTitles: [titled, attendance],
      precheckedIds: [11],
    });

    await pickTitle(user, "Top 1");
    await waitFor(() => {
      expect(fetchCourseMainTeacher).toHaveBeenCalledWith(7);
    });
    await waitFor(() => {
      expect(
        composite.mock.calls.some(
          (call) =>
            call[1]?.mtName === "Daw Su" &&
            call[1]?.mtSignatureUrl === "https://cdn.example/mt.png",
        ),
      ).toBe(true);
    });
  });

  it("cycles the preview among checked students", async () => {
    const user = userEvent.setup();
    const titled = { ...top1, has_display_template: true };
    getAwardDisplayTemplate.mockResolvedValue({
      id: 9,
      name: "Cert",
      document: {},
      background_url: null,
    });
    composite.mockResolvedValue({
      toDataURL: () => "data:image/png;base64,preview",
    });
    fetchUserImageUrls.mockResolvedValue({
      urls: {
        "11": "https://cdn.example/hla.png",
        "12": "https://cdn.example/kyaw.png",
      },
      sources: {},
    });
    renderComposer({
      picker: { ...picker, pinned: [titled] },
      orgTitles: [titled, attendance],
      precheckedIds: [11, 12],
    });

    await pickTitle(user, "Top 1");
    await waitFor(() => {
      expect(
        composite.mock.calls.some((call) => call[1]?.studentName === "Hla Hla"),
      ).toBe(true);
    });
    expect(screen.getByRole("button", { name: "Previous student" })).toBeTruthy();
    const templateCalls = getAwardDisplayTemplate.mock.calls.length;
    expect(fetchUserImageUrls).toHaveBeenCalledWith([11, 12], "award_image");

    await user.click(screen.getByRole("button", { name: "Next student" }));
    await waitFor(() => {
      expect(
        composite.mock.calls.some(
          (call) =>
            call[1]?.studentName === "Kyaw Thu" &&
            call[1]?.awardImageUrl === "https://cdn.example/kyaw.png",
        ),
      ).toBe(true);
    });
    expect(getAwardDisplayTemplate.mock.calls.length).toBe(templateCalls);
    expect(fetchUserImageUrls).not.toHaveBeenCalledWith([12], "award_image");

    const hlaComposites = composite.mock.calls.filter(
      (call) => call[1]?.studentName === "Hla Hla",
    ).length;
    await user.click(screen.getByRole("button", { name: "Previous student" }));
    expect(
      await screen.findByRole("img", { name: /Award preview for Hla Hla/ }),
    ).toBeTruthy();
    expect(
      composite.mock.calls.filter((call) => call[1]?.studentName === "Hla Hla")
        .length,
    ).toBe(hlaComposites);
  });

  it("keeps preview arrows under the image when one student is checked", async () => {
    const user = userEvent.setup();
    const titled = { ...top1, has_display_template: true };
    getAwardDisplayTemplate.mockResolvedValue({
      id: 9,
      name: "Cert",
      document: {},
      background_url: null,
    });
    composite.mockResolvedValue({
      toDataURL: () => "data:image/png;base64,preview",
    });
    renderComposer({
      picker: { ...picker, pinned: [titled] },
      orgTitles: [titled, attendance],
      precheckedIds: [11],
    });

    await pickTitle(user, "Top 1");
    await screen.findByRole("img", { name: /Award preview/ });

    const frame = document.querySelector("[data-slot='award-grant-preview']");
    const prev = screen.getByRole("button", {
      name: "Previous student",
    }) as HTMLButtonElement;
    const next = screen.getByRole("button", {
      name: "Next student",
    }) as HTMLButtonElement;
    expect(frame).toBeTruthy();
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(true);
    expect(
      frame!.compareDocumentPosition(prev) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      frame!.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows a loading preview status while the composite is pending", async () => {
    const user = userEvent.setup();
    const titled = { ...top1, has_display_template: true };
    getAwardDisplayTemplate.mockResolvedValue({
      id: 9,
      name: "Cert",
      document: {},
      background_url: null,
    });
    let release: ((canvas: { toDataURL: () => string }) => void) | undefined;
    composite.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    renderComposer({
      picker: { ...picker, pinned: [titled] },
      orgTitles: [titled, attendance],
      precheckedIds: [11],
    });

    await pickTitle(user, "Top 1");
    expect(
      await screen.findByRole("status", { name: /loading preview/i }),
    ).toBeTruthy();
    expect(screen.queryByRole("img", { name: /Award preview/ })).toBeNull();

    release?.({ toDataURL: () => "data:image/png;base64,preview" });
    expect(await screen.findByRole("img", { name: /Award preview/ })).toBeTruthy();
    expect(screen.queryByRole("status", { name: /loading preview/i })).toBeNull();
  });

  it("keeps the current preview visible while the next student composite is pending", async () => {
    const user = userEvent.setup();
    const titled = { ...top1, has_display_template: true };
    getAwardDisplayTemplate.mockResolvedValue({
      id: 9,
      name: "Cert",
      document: {},
      background_url: null,
    });
    let releaseNext: ((canvas: { toDataURL: () => string }) => void) | undefined;
    composite.mockImplementation((_doc, bind) => {
      if (bind?.studentName === "Hla Hla") {
        return Promise.resolve({
          toDataURL: () => "data:image/png;base64,hla",
        });
      }
      return new Promise((resolve) => {
        releaseNext = resolve;
      });
    });
    fetchUserImageUrls.mockResolvedValue({
      urls: {
        "11": "https://cdn.example/hla.png",
        "12": "https://cdn.example/kyaw.png",
      },
      sources: {},
    });
    renderComposer({
      picker: { ...picker, pinned: [titled] },
      orgTitles: [titled, attendance],
      precheckedIds: [11, 12],
    });

    await pickTitle(user, "Top 1");
    const first = await screen.findByRole("img", {
      name: /Award preview for Hla Hla/,
    });
    expect(first.getAttribute("src")).toBe("data:image/png;base64,hla");

    await user.click(screen.getByRole("button", { name: "Next student" }));
    const held = screen.getByRole("img", { name: /Award preview/ });
    expect(held.getAttribute("src")).toBe("data:image/png;base64,hla");
    expect(screen.getByRole("status", { name: /loading preview/i })).toBeTruthy();

    releaseNext?.({ toDataURL: () => "data:image/png;base64,kyaw" });
    const next = await screen.findByRole("img", {
      name: /Award preview for Kyaw Thu/,
    });
    expect(next.getAttribute("src")).toBe("data:image/png;base64,kyaw");
    expect(screen.queryByRole("status", { name: /loading preview/i })).toBeNull();
  });

  it("scrolls the award title to eye level when the composer opens", async () => {
    const view = renderComposer({ open: false });
    expect(scrollElementToViewportRatio).not.toHaveBeenCalled();

    view.rerender(<AwardGrantComposer {...composerProps({ open: true })} />);
    await waitFor(() => {
      expect(scrollElementToViewportRatio).toHaveBeenCalled();
    });
    expect(
      (scrollElementToViewportRatio.mock.calls[0]?.[0] as HTMLElement).id,
    ).toBe("award-grant-title");
    expect(scrollElementToViewportRatio.mock.calls[0]?.[1]).toEqual({
      targetRatio: 0.4,
      relativeToContainer: true,
    });
  });

  it("restores the main-content scroll anchor when the composer collapses", async () => {
    const view = renderComposer({ open: true });
    await waitFor(() => {
      expect(scrollElementToViewportRatio).toHaveBeenCalled();
    });

    view.rerender(<AwardGrantComposer {...composerProps({ open: false })} />);
    expect(restoreMainContentViewportAnchor).toHaveBeenCalled();
  });
});
