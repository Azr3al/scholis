import { describe, expect, it } from "vitest";
import {
  applyIdCardBrandingToPayload,
  buildOrganizationOwnerFormData,
  validateMicrosoftOwnerSetup,
} from "./organization-profile-submit";
import { VideoConferencingPlatform } from "@/types/organization";

describe("validateMicrosoftOwnerSetup", () => {
  it("returns null when Microsoft is disabled", () => {
    expect(
      validateMicrosoftOwnerSetup({ is_microsoft_on: false }, {
        wasMicrosoftOnAtLoad: false,
      }),
    ).toBeNull();
  });

  it("requires Teams-ready fields for first-time enablement", () => {
    expect(
      validateMicrosoftOwnerSetup(
        {
          is_microsoft_on: true,
          authority: "https://login.microsoftonline.com/x",
          app_id: "app",
          tenant_id: "tenant",
          default_owner_id: "owner-guid",
        },
        { wasMicrosoftOnAtLoad: false },
      ),
    ).toContain("thumbprint");
  });

  it("passes when first-time fields are complete", () => {
    const file = new File(["key"], "key.pem", { type: "application/x-pem-file" });
    expect(
      validateMicrosoftOwnerSetup(
        {
          is_microsoft_on: true,
          authority: "https://login.microsoftonline.com/x",
          app_id: "app",
          tenant_id: "tenant",
          thumbprint: "ABCD",
          default_owner_id: "owner-guid",
          private_key: file,
        },
        { wasMicrosoftOnAtLoad: false },
      ),
    ).toBeNull();
  });

  it("does not require private key when already Microsoft-enabled", () => {
    expect(
      validateMicrosoftOwnerSetup(
        {
          is_microsoft_on: true,
          authority: "https://login.microsoftonline.com/x",
          app_id: "app",
          tenant_id: "tenant",
        },
        { wasMicrosoftOnAtLoad: true },
      ),
    ).toBeNull();
  });
});

describe("buildOrganizationOwnerFormData", () => {
  it("sets video platform to Teams when enabling Microsoft", () => {
    const fd = buildOrganizationOwnerFormData({
      is_microsoft_on: true,
      name: "School",
      video_conferencing_platform: null,
    });
    expect(fd.get("video_conferencing_platform")).toBe(
      VideoConferencingPlatform.microsoft_teams,
    );
  });

  it("serializes approved domains as repeated form fields", () => {
    const fd = buildOrganizationOwnerFormData({
      name: "School",
      available_domains: ["school.edu", "school.org"],
    });
    expect(fd.getAll("available_domains")).toEqual([
      "school.edu",
      "school.org",
    ]);
  });

  it("appends private key file when provided", () => {
    const file = new File(["key"], "key.pem");
    const fd = buildOrganizationOwnerFormData({
      is_microsoft_on: true,
      private_key: file,
    });
    expect(fd.get("private_key")).toBe(file);
  });

  it("skips empty write-only strings", () => {
    const fd = buildOrganizationOwnerFormData({
      is_microsoft_on: true,
      thumbprint: "  ",
      client_secret: "",
    });
    expect(fd.get("thumbprint")).toBeNull();
    expect(fd.get("client_secret")).toBeNull();
  });

  it("sends empty strings to clear nullable ID card branding fields", () => {
    const fd = buildOrganizationOwnerFormData({
      name: "School",
      id_card_org_name: null,
      id_card_staff_accent: "",
      id_card_logo: null,
    });
    expect(fd.get("id_card_org_name")).toBe("");
    expect(fd.get("id_card_staff_accent")).toBe("");
    expect(fd.get("id_card_logo")).toBe("");
  });
});

describe("applyIdCardBrandingToPayload", () => {
  it("trims branding strings and clears logo when requested", () => {
    const payload: Record<string, unknown> = {
      id_card_org_name: "  SDEC  ",
      id_card_staff_accent: "  ",
      id_card_student_accent: "#abc",
      id_card_logo: "https://cdn.example/logo.png",
    };
    applyIdCardBrandingToPayload(payload, { logoCleared: true });
    expect(payload.id_card_org_name).toBe("SDEC");
    expect(payload.id_card_staff_accent).toBeNull();
    expect(payload.id_card_student_accent).toBe("#abc");
    expect(payload.id_card_logo).toBeNull();
  });

  it("drops logo URL from payload when not clearing", () => {
    const payload: Record<string, unknown> = {
      id_card_logo: "https://cdn.example/logo.png",
    };
    applyIdCardBrandingToPayload(payload, { logoCleared: false });
    expect(payload.id_card_logo).toBeUndefined();
  });
});
