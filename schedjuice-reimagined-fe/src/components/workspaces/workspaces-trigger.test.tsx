import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceCard } from "@/config/workspaces";

const setOpen = vi.fn();
const setOpenMobile = vi.fn();
let workspaces: WorkspaceCard[] = [];

vi.mock("./use-workspaces", () => ({
  useWorkspaces: () => ({ open: false, setOpen, workspaces }),
}));

vi.mock("@/components/shell/sidebar-context", () => ({
  useSidebar: () => ({
    open: true,
    isMobile: false,
    recordMode: false,
    setOpenMobile,
  }),
}));

import { WorkspacesTrigger } from "./workspaces-trigger";

afterEach(() => {
  cleanup();
  setOpen.mockClear();
  setOpenMobile.mockClear();
  workspaces = [];
});

describe("WorkspacesTrigger", () => {
  it("renders nothing when there are no workspaces", () => {
    workspaces = [];
    const { container } = render(<WorkspacesTrigger />);
    expect(container.firstChild).toBeNull();
  });

  it("opens the overlay when Workspaces is clicked", async () => {
    workspaces = [
      {
        id: "studio",
        label: "Studio",
        logo: "studio",
        status: "enterable",
        homeHref: "/studio",
      },
    ];
    const user = userEvent.setup();
    render(<WorkspacesTrigger />);
    await user.click(screen.getByRole("button", { name: "Workspaces" }));
    expect(setOpen).toHaveBeenCalledWith(true);
  });
});
