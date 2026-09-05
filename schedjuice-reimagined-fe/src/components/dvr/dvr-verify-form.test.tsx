import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DvrVerifyForm } from "./dvr-verify-form";
import { DVR_PREVIEW_STUB_USER } from "@/helpers/dvr";
import type { CustomFieldDefinitionDto } from "@/types/custom-fields";
import { EMPTY_FORM_CONFIG } from "@/types/form-config";

const updateEntity = vi.fn();
let mockDefinitions: CustomFieldDefinitionDto[] = [];
let mockFormConfig = { ...EMPTY_FORM_CONFIG, groups: [] as typeof EMPTY_FORM_CONFIG.groups };

vi.mock("@/app/client-api/utils", () => ({
  updateEntity: (...args: unknown[]) => updateEntity(...args),
}));

vi.mock("@/hooks/use-field-definitions", () => ({
  useFieldDefinitions: () => ({ data: mockDefinitions, isLoading: false }),
}));

vi.mock("@/hooks/use-form-config", () => ({
  useFormConfig: () => ({ data: mockFormConfig, isLoading: false }),
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
  return (
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

describe("DvrVerifyForm preview mode", () => {
  beforeEach(() => {
    updateEntity.mockReset();
    mockDefinitions = [];
    mockFormConfig = { ...EMPTY_FORM_CONFIG, groups: [] };
  });

  it("shows empty guidance when no fields are included", async () => {
    render(
      wrap(
        <DvrVerifyForm
          mode="preview"
          user={DVR_PREVIEW_STUB_USER}
          rawFields={[]}
          title="Preview"
        />,
      ),
    );
    expect(
      await screen.findByText(/select at least one field/i),
    ).toBeTruthy();
  });

  it("does not expose Submit or call updateEntity", async () => {
    render(
      wrap(
        <DvrVerifyForm
          mode="preview"
          user={DVR_PREVIEW_STUB_USER}
          rawFields={[{ name: "phone_number", required: false }]}
          title="Preview"
        />,
      ),
    );
    expect(await screen.findByLabelText(/phone/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^submit$/i })).toBeNull();
    expect(updateEntity).not.toHaveBeenCalled();
  });

  it("renders provided title and helper in preview", async () => {
    render(
      wrap(
        <DvrVerifyForm
          mode="preview"
          user={DVR_PREVIEW_STUB_USER}
          rawFields={[{ name: "city", required: false }]}
          title="Preview"
          description="This is what recipients will fill in."
        />,
      ),
    );
    expect(await screen.findByText("Preview")).toBeTruthy();
    expect(
      screen.getByText(/what recipients will fill in/i),
    ).toBeTruthy();
  });

  it("renders scrambled builtins in catalog order", async () => {
    const { container } = render(
      wrap(
        <DvrVerifyForm
          mode="preview"
          user={DVR_PREVIEW_STUB_USER}
          rawFields={[
            { name: "country", required: false },
            { name: "communication_email", required: false },
            { name: "region", required: false },
          ]}
          title="Preview"
        />,
      ),
    );
    await screen.findByLabelText(/communication email/i);
    const texts = Array.from(container.querySelectorAll("label")).map((el) =>
      (el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase(),
    );
    const emailIdx = texts.findIndex((t) => t.includes("communication email"));
    const regionIdx = texts.findIndex((t) => t.includes("region"));
    const countryIdx = texts.findIndex((t) => t.includes("country"));
    expect(emailIdx).toBeGreaterThanOrEqual(0);
    expect(regionIdx).toBeGreaterThan(emailIdx);
    expect(countryIdx).toBeGreaterThan(regionIdx);
  });

  it("shows required mark when alternative_name is marked required", async () => {
    render(
      wrap(
        <DvrVerifyForm
          mode="preview"
          user={DVR_PREVIEW_STUB_USER}
          rawFields={[{ name: "alternative_name", required: true }]}
          title="Preview"
        />,
      ),
    );
    await screen.findByLabelText(/alternative name/i);
    expect(screen.queryByText(/· optional/i)).toBeNull();
    expect(screen.getByText("*")).toBeTruthy();
  });
});

describe("DvrVerifyForm verify mode", () => {
  beforeEach(() => {
    updateEntity.mockReset();
    mockDefinitions = [];
    mockFormConfig = { ...EMPTY_FORM_CONFIG, groups: [] };
  });

  it("renders custom fields omitted from role/surface-filtered form-config", async () => {
    mockDefinitions = [
      {
        id: 42,
        source: "custom",
        entity_type: "app_auth.User",
        field_key: "t_shirt_size",
        field_label: "T-shirt sizes",
        field_type: "choice",
        is_required: false,
        is_filterable: false,
        sort_order: 0,
        choices: [
          { value: "S", label: "S" },
          { value: "M", label: "M" },
        ],
        validation_rules: null,
        description: "",
        is_active: true,
        required_at: "never",
        roles: ["teacher"],
        filled_by: "both",
        group: null,
        show_on_create: false,
        show_on_edit: false,
        show_on_detail: true,
        form_input_mode: "editable",
      },
    ];
    mockFormConfig = { ...EMPTY_FORM_CONFIG, groups: [] };

    render(
      wrap(
        <DvrVerifyForm
          mode="verify"
          user={DVR_PREVIEW_STUB_USER}
          dvrId={9}
          rawFields={[{ name: "t_shirt_size", required: false }]}
          onVerified={vi.fn()}
          title="T-shirt sizes"
          description="Please verify your data. Update your information if needed."
        />,
      ),
    );

    await waitFor(() => {
      expect(
        document.querySelector('[name="custom_data.t_shirt_size"]'),
      ).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /^submit$/i })).toBeTruthy();
    expect(screen.queryByText(/no fields to verify/i)).toBeNull();
  });

  it("rejects missing required fields without calling updateEntity", async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <DvrVerifyForm
          mode="verify"
          user={DVR_PREVIEW_STUB_USER}
          dvrId={9}
          rawFields={[{ name: "communication_email", required: true }]}
          onVerified={vi.fn()}
        />,
      ),
    );
    await user.click(await screen.findByRole("button", { name: /^submit$/i }));
    await waitFor(() => {
      expect(updateEntity).not.toHaveBeenCalled();
    });
    expect(
      screen.getByText(/invalid|email|required|communication/i),
    ).toBeTruthy();
  });
});
