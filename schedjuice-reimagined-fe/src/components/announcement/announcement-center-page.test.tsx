import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mockReplace = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
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

vi.mock("@/app/client-api/utils", () => ({
  searchEntities: vi.fn(() =>
    Promise.resolve({
      data: {
        data: [],
        links: {},
      },
    }),
  ),
}));

vi.mock("@/components/announcement/announcement-list", () => ({
  default: () => <div data-testid="announcement-list" />,
}));

vi.mock("@/components/announcement/announcement-creation-center-form", () => ({
  AnnouncementCreationCenterForm: ({
    onCancel,
  }: {
    onCancel?: () => void;
  }) => (
    <div>
      <div data-testid="creation-form" />
      <button type="button" onClick={onCancel}>
        Cancel composer
      </button>
    </div>
  ),
}));

import AnnouncementCenterPage from "@/app/(internal)/content/announcement-center/page";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementCenterPage />
    </QueryClientProvider>,
  );
}

describe("AnnouncementCenterPage", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    for (const key of [...mockSearchParams.keys()]) {
      mockSearchParams.delete(key);
    }
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens the inline composer when create=1 is present and strips the param", async () => {
    mockSearchParams.set("create", "1");
    renderPage();

    expect(await screen.findByTestId("creation-form")).toBeTruthy();
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        "/content/announcement-center",
        { scroll: false },
      );
    });
  });

  it("shows create composer after clicking the header action", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByTestId("creation-form")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /create announcement/i }),
    );
    expect(screen.getByTestId("creation-form")).toBeTruthy();
  });
});
