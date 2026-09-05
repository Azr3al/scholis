import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DvrCreateDesigner } from "./dvr-create-designer";

const makePostRequest = vi.fn();
const push = vi.fn();

vi.mock("@/app/client-api/utils", () => ({
  makePostRequest: (...args: unknown[]) => makePostRequest(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/data-verification-requests/create",
}));

vi.mock("@/components/misc/back-button", () => ({
  default: () => <button type="button">Back</button>,
}));

vi.mock("@/hooks/use-field-definitions", () => ({
  useFieldDefinitions: () => ({
    data: [],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/use-form-config", () => ({
  useFormConfig: () => ({ data: { groups: [] }, isLoading: false }),
}));

vi.mock("@/components/form/role-chooser", () => ({
  default: ({
    roles,
    setRoles,
  }: {
    roles: string[];
    setRoles: (r: string[]) => void;
  }) => (
    <button type="button" onClick={() => setRoles([])}>
      roles:{roles.length}
    </button>
  ),
}));

vi.mock("@/components/primitives", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/primitives")>();
  return {
    ...actual,
    useToast: () => ({ add: vi.fn() }),
  };
});

afterEach(() => {
  cleanup();
});

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("DvrCreateDesigner", () => {
  beforeEach(() => {
    makePostRequest.mockReset();
    push.mockReset();
  });

  it("does not POST when all fields are unchecked", async () => {
    const user = userEvent.setup();
    render(wrap(<DvrCreateDesigner />));

    const catalogLabels = [
      "communication email",
      "alternative name",
      "date of birth",
      "phone number",
      "house number",
      "street",
      "township",
      "city",
      "region",
      "country",
    ];
    for (const label of catalogLabels) {
      const checkbox = screen.getByRole("checkbox", {
        name: new RegExp(`^${label}$`, "i"),
      });
      if (checkbox.getAttribute("aria-checked") === "true") {
        await user.click(checkbox);
      }
    }

    await user.click(screen.getByRole("button", { name: /^submit$/i }));
    expect(makePostRequest).not.toHaveBeenCalled();
    expect(
      within(screen.getByTestId("dvr-preview")).getByText(
        /select at least one field/i,
      ),
    ).toBeTruthy();
  });

  it("removes a field from preview when Include is unchecked", async () => {
    const user = userEvent.setup();
    render(wrap(<DvrCreateDesigner />));
    const preview = await screen.findByTestId("dvr-preview");
    expect(within(preview).getByLabelText(/phone/i)).toBeTruthy();
    await user.click(
      screen.getByRole("checkbox", { name: /^phone number$/i }),
    );
    await waitFor(() => {
      expect(within(preview).queryByLabelText(/phone/i)).toBeNull();
    });
    expect(
      screen.getByRole("checkbox", { name: /^phone number$/i }),
    ).toBeTruthy();
  });

  it("keeps expiry and users only inside the settings sheet", async () => {
    const user = userEvent.setup();
    render(wrap(<DvrCreateDesigner />));

    expect(screen.queryByRole("heading", { name: /request settings/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^roles:/i })).toBeNull();

    await user.click(
      screen.getByRole("button", { name: /request settings/i }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/expires on/i)).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /^roles:/i })).toBeTruthy();
    expect(
      within(dialog).getByRole("heading", { name: /request settings/i }),
    ).toBeTruthy();
  });

  it("places Submit in the header and removes the field-count footer", () => {
    render(wrap(<DvrCreateDesigner />));

    expect(screen.getByRole("button", { name: /^submit$/i })).toBeTruthy();
    expect(screen.queryByText(/fields? selected/i)).toBeNull();
  });

  it("shows untitled DVR placeholder and does not POST an empty name", async () => {
    const user = userEvent.setup();
    render(wrap(<DvrCreateDesigner />));

    expect(screen.getByText(/untitled dvr/i)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /^name$/i })).toBeNull();

    await user.click(screen.getByRole("button", { name: /^submit$/i }));
    expect(makePostRequest).not.toHaveBeenCalled();
  });

  it("lets the user edit the name via the inline title control", async () => {
    const user = userEvent.setup();
    render(wrap(<DvrCreateDesigner />));

    await user.click(screen.getByRole("button", { name: /edit name/i }));
    const input = screen.getByRole("textbox", { name: /^name$/i });
    await user.type(input, "Q3 staff verify");
    await user.tab();

    expect(
      screen.getByRole("button", { name: /edit name/i }).textContent,
    ).toContain("Q3 staff verify");
  });
});
