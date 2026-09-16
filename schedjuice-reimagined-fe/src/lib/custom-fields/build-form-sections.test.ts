import { describe, expect, it } from "vitest";
import { buildFormSections } from "./build-form-sections";
import type { FormConfig } from "@/types/form-config";

const cfg: FormConfig = {
  entityType: "app_auth.User",
  surface: "edit",
  groups: [
    {
      id: 1,
      name: "Personal",
      sortOrder: 0,
      fields: [
        {
          id: 1,
          source: "builtin",
          fieldKey: "gender",
          fieldLabel: "Gender",
          fieldType: "choice",
          choices: [],
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

describe("buildFormSections", () => {

  it("create: identity prelude + config groups only (no operational sections)", () => {
    const sections = buildFormSections(cfg, {
      surface: "create",
      availableKeys: new Set(["name", "email", "salary"]),
    });
    expect(sections.map((s) => s.kind)).toEqual(["identity", "config"]);
  });

  it("omits an operational section when none of its keys are present", () => {
    const sections = buildFormSections(cfg, {
      surface: "edit",
      availableKeys: new Set(["name", "email"]),
    });
    expect(sections.map((s) => s.kind)).toEqual(["identity", "config"]);
  });

  it("preserves config group order from API after the Profile prelude", () => {
    const orderedCfg: FormConfig = {
      entityType: "app_auth.User",
      surface: "create",
      groups: [
        {
          id: 2,
          name: "Testing",
          sortOrder: 0,
          fields: [
            {
              id: 2,
              source: "custom",
              fieldKey: "date_testing",
              fieldLabel: "Date testing",
              fieldType: "datetime",
              choices: null,
              description: "",
              requiredAt: "never",
              filledBy: "both",
              isFilterable: false,
              sortOrder: 0,
              validationRules: null,
              groupId: 2,
            },
          ],
        },
        {
          id: 1,
          name: "Personal",
          sortOrder: 1,
          fields: [
            {
              id: 1,
              source: "builtin",
              fieldKey: "gender",
              fieldLabel: "Gender",
              fieldType: "choice",
              choices: [],
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

    const sections = buildFormSections(orderedCfg, {
      surface: "create",
      availableKeys: new Set(["name", "email", "gender", "date_testing"]),
    });

    expect(sections.map((s) => s.kind)).toEqual(["identity", "config", "config"]);
    const configSections = sections.filter((s) => s.kind === "config");
    expect(configSections.map((s) => s.title)).toEqual(["Testing", "Personal"]);
  });
});
