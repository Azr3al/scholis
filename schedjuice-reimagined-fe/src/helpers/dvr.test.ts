import { describe, expect, it } from "vitest";
import {
  buildDvrCustomFormConfig,
  clearFieldKeys,
  defaultDvrExpiresOn,
  DVR_BUILTIN_FIELD_NAMES,
  DVR_PREVIEW_STUB_USER,
  mergeCustomFieldDefaults,
  normalizeDvrFields,
  orderDvrFieldsLikeCatalog,
  pendingUserDvrsQueryKey,
  pickBannerUserDvr,
  resolveDvrVerifyFields,
  selectAllFieldKeys,
} from "./dvr";
import type { CustomFieldDefinitionDto } from "@/types/custom-fields";
import { EMPTY_FORM_CONFIG, type FormConfig } from "@/types/form-config";

function customDef(
  partial: Partial<CustomFieldDefinitionDto> &
    Pick<CustomFieldDefinitionDto, "field_key" | "field_label">,
): CustomFieldDefinitionDto {
  return {
    id: partial.id ?? 1,
    source: "custom",
    entity_type: "app_auth.User",
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
    ...partial,
  };
}

describe("normalizeDvrFields", () => {
  it("coerces legacy strings", () => {
    expect(normalizeDvrFields(["phone_number"])).toEqual([
      { name: "phone_number", required: false },
    ]);
  });
});

describe("mergeCustomFieldDefaults", () => {
  it("appends missing custom keys without wiping existing toggles", () => {
    const selected = [{ name: "phone_number", required: true }];
    expect(
      mergeCustomFieldDefaults(selected, ["employee_id", "phone_number"]),
    ).toEqual([
      { name: "phone_number", required: true },
      { name: "employee_id", required: false },
    ]);
  });
});

describe("selectAllFieldKeys / clearFieldKeys", () => {
  it("selectAll preserves existing required flags", () => {
    const selected = [{ name: "phone_number", required: true }];
    const next = selectAllFieldKeys(selected, ["phone_number", "city"]);
    expect(next.find((f) => f.name === "phone_number")).toEqual({
      name: "phone_number",
      required: true,
    });
    expect(next.find((f) => f.name === "city")).toEqual({
      name: "city",
      required: false,
    });
  });

  it("clearFieldKeys only removes listed keys", () => {
    expect(
      clearFieldKeys(
        [
          { name: "phone_number", required: true },
          { name: "t_shirt_size", required: false },
        ],
        DVR_BUILTIN_FIELD_NAMES,
      ),
    ).toEqual([{ name: "t_shirt_size", required: false }]);
  });
});

describe("pendingUserDvrsQueryKey", () => {
  it("matches the AppShell banner query key", () => {
    expect(pendingUserDvrsQueryKey(42)).toEqual(["pending-user-dvrs", 42]);
  });
});

describe("resolveDvrVerifyFields", () => {
  it("keeps builtins and only active customs", () => {
    const raw = [
      { name: "phone_number", required: true },
      { name: "employee_id", required: true },
      { name: "gone_field", required: true },
    ];
    expect(resolveDvrVerifyFields(raw, new Set(["employee_id"]))).toEqual({
      builtins: [{ name: "phone_number", required: true }],
      customs: [{ name: "employee_id", required: true }],
    });
  });

  it("orders builtins and customs like the field catalog, not raw array order", () => {
    const raw = [
      { name: "country", required: false },
      { name: "hobby", required: true },
      { name: "region", required: false },
      { name: "communication_email", required: true },
      { name: "t_shirt_size", required: false },
    ];
    expect(
      resolveDvrVerifyFields(raw, new Set(["hobby", "t_shirt_size"]), [
        "t_shirt_size",
        "occupation",
        "hobby",
      ]),
    ).toEqual({
      builtins: [
        { name: "communication_email", required: true },
        { name: "region", required: false },
        { name: "country", required: false },
      ],
      customs: [
        { name: "t_shirt_size", required: false },
        { name: "hobby", required: true },
      ],
    });
  });
});

describe("orderDvrFieldsLikeCatalog", () => {
  it("rejects insertion order in favor of catalog order", () => {
    const ordered = orderDvrFieldsLikeCatalog(
      [
        { name: "country", required: false },
        { name: "hobby", required: false },
        { name: "communication_email", required: false },
        { name: "t_shirt_size", required: false },
      ],
      ["t_shirt_size", "hobby"],
    );
    expect(ordered.map((f) => f.name)).toEqual([
      "communication_email",
      "country",
      "t_shirt_size",
      "hobby",
    ]);
  });
});

describe("buildDvrCustomFormConfig", () => {
  it("synthesizes fields missing from role/surface-filtered form-config", () => {
    const emptyEditConfig: FormConfig = {
      ...EMPTY_FORM_CONFIG,
      surface: "edit",
      groups: [],
    };
    const cfg = buildDvrCustomFormConfig(
      emptyEditConfig,
      [{ name: "t_shirt_size", required: true }],
      [customDef({ id: 42, field_key: "t_shirt_size", field_label: "T-shirt sizes" })],
    );
    expect(cfg.groups).toHaveLength(1);
    expect(cfg.groups[0].fields).toEqual([
      expect.objectContaining({
        id: 42,
        fieldKey: "t_shirt_size",
        fieldLabel: "T-shirt sizes",
        fieldType: "choice",
        source: "custom",
        requiredAt: "never",
      }),
    ]);
  });

  it("prefers form-config field when present", () => {
    const fromConfig: FormConfig = {
      ...EMPTY_FORM_CONFIG,
      groups: [
        {
          id: 1,
          name: "Extras",
          sortOrder: 0,
          fields: [
            {
              id: 7,
              source: "custom",
              fieldKey: "t_shirt_size",
              fieldLabel: "Shirt (from config)",
              fieldType: "text",
              choices: null,
              description: "",
              requiredAt: "never",
              filledBy: "both",
              isFilterable: false,
              sortOrder: 0,
              validationRules: null,
              groupId: 1,
            },
          ],
        },
      ],
    };
    const cfg = buildDvrCustomFormConfig(
      fromConfig,
      [{ name: "t_shirt_size", required: false }],
      [customDef({ id: 42, field_key: "t_shirt_size", field_label: "T-shirt sizes" })],
    );
    expect(cfg.groups[0].fields[0].fieldLabel).toBe("Shirt (from config)");
    expect(cfg.groups[0].fields[0].requiredAt).toBe("never");
  });
});

describe("DVR_PREVIEW_STUB_USER", () => {
  it("is a non-persisted stub with staff-ish roles", () => {
    expect(DVR_PREVIEW_STUB_USER.id).toBe(0);
    expect(DVR_PREVIEW_STUB_USER.roles).toContain("teacher");
  });
});

describe("defaultDvrExpiresOn", () => {
  it("is today + 14 days", () => {
    expect(defaultDvrExpiresOn(new Date(2026, 6, 18))).toBe("2026-08-01");
  });
});

describe("pickBannerUserDvr", () => {
  it("picks soonest pending unexpired", () => {
    const picked = pickBannerUserDvr(
      [
        {
          id: 1,
          status: "pending",
          data_verification_request: {
            id: 10,
            expires_on: "2026-07-28",
            name: "A",
          },
        },
        {
          id: 2,
          status: "pending",
          data_verification_request: {
            id: 11,
            expires_on: "2026-07-20",
            name: "B",
          },
        },
      ],
      new Date(2026, 6, 18),
    );
    expect(picked?.id).toBe(2);
  });
});
