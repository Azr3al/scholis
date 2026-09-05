import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceCard } from "@/config/workspaces";

const push = vi.fn();
const setOpen = vi.fn();
const confirmNavigation = vi.fn(() => true);

let open = true;
let workspaces: WorkspaceCard[] = [
  {
    id: "finance",
    label: "Finance",
    logo: "finance",
    status: "enterable",
    homeHref: "/finances",
  },
  {
    id: "studio",
    label: "Studio",
    logo: "studio",
    status: "enterable",
    homeHref: "/studio",
  },
  {
    id: "hr",
    label: "HR",
    logo: "hr",
    status: "coming_soon",
  },
  {
    id: "admissions",
    label: "Admissions",
    logo: "admissions",
    status: "coming_soon",
  },
];

const defaultWorkspaces = workspaces;

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/components/shell/use-navigation-guard", () => ({
  useNavigationGuard: () => ({ confirmNavigation }),
}));

vi.mock("./use-workspaces", () => ({
  useWorkspaces: () => ({ open, setOpen, workspaces }),
}));

import { WorkspacesDialog } from "./workspaces-dialog";

afterEach(() => {
  cleanup();
  push.mockClear();
  setOpen.mockClear();
  confirmNavigation.mockReturnValue(true);
  open = true;
  workspaces = defaultWorkspaces;
});

describe("WorkspacesDialog", () => {
  it("navigates to Finance home and closes", () => {
    render(<WorkspacesDialog />);
    fireEvent.click(screen.getByRole("link", { name: "Finance" }));
    expect(push).toHaveBeenCalledWith("/finances");
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("navigates to Studio home and closes", () => {
    render(<WorkspacesDialog />);
    fireEvent.click(screen.getByRole("link", { name: "Studio" }));
    expect(push).toHaveBeenCalledWith("/studio");
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("navigates to CRM home and closes when enterable", () => {
    workspaces = [
      {
        id: "crm",
        label: "CRM",
        logo: "crm",
        status: "enterable",
        homeHref: "/crm/leads",
      },
      {
        id: "hr",
        label: "HR",
        logo: "hr",
        status: "coming_soon",
      },
    ];
    render(<WorkspacesDialog />);
    fireEvent.click(screen.getByRole("link", { name: "CRM" }));
    expect(push).toHaveBeenCalledWith("/crm/leads");
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("does not close when the navigation guard blocks", () => {
    confirmNavigation.mockReturnValue(false);
    render(<WorkspacesDialog />);
    fireEvent.click(screen.getByRole("link", { name: "Studio" }));
    expect(push).not.toHaveBeenCalled();
    expect(setOpen).not.toHaveBeenCalled();
  });

  it("does not expose coming-soon workspaces as links", () => {
    render(<WorkspacesDialog />);
    expect(screen.queryByRole("link", { name: "HR" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Admissions" })).toBeNull();
    expect(screen.getAllByText("Coming soon").length).toBe(2);
  });

  it("navigates to Admissions home and closes when enterable", () => {
    workspaces = [
      {
        id: "admissions",
        label: "Admissions",
        logo: "admissions",
        status: "enterable",
        homeHref: "/admissions",
      },
      {
        id: "hr",
        label: "HR",
        logo: "hr",
        status: "coming_soon",
      },
    ];
    render(<WorkspacesDialog />);
    fireEvent.click(screen.getByRole("link", { name: "Admissions" }));
    expect(push).toHaveBeenCalledWith("/admissions");
    expect(setOpen).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("link", { name: "HR" })).toBeNull();
  });

  it("has no search field", () => {
    render(<WorkspacesDialog />);
    expect(screen.queryByPlaceholderText("Search apps")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
