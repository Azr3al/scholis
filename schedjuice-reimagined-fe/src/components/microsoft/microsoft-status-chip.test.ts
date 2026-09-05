import { describe, expect, it } from "vitest";
import { getMicrosoftStatusConfig } from "./microsoft-status-chip";

describe("getMicrosoftStatusConfig", () => {
  it("maps linked/created/already_linked to a green positive chip", () => {
    for (const status of ["linked", "already_linked", "created"]) {
      const config = getMicrosoftStatusConfig(status);
      expect(config.label).toBe(
        status === "created" ? "Created" : "Linked",
      );
      expect(config.variant).toBe("primary");
      expect(config.className).toContain("emerald");
    }
  });

  it("maps blocking statuses to danger chips", () => {
    for (const status of [
      "domain_blocked",
      "invalid_domain",
      "missing_license",
      "missing_owner",
      "missing_config",
      "conflict",
      "failed",
    ]) {
      expect(getMicrosoftStatusConfig(status).variant).toBe("danger");
    }
  });

  it("treats invalid_domain and domain_blocked as the same label", () => {
    expect(getMicrosoftStatusConfig("invalid_domain").label).toBe(
      getMicrosoftStatusConfig("domain_blocked").label,
    );
  });

  it("surfaces possible-duplicate guidance for conflicts", () => {
    expect(getMicrosoftStatusConfig("conflict").label).toBe("Possible duplicate");
  });

  it("falls back to the raw status with a secondary chip when unknown", () => {
    const config = getMicrosoftStatusConfig("some_new_backend_status");
    expect(config.label).toBe("some_new_backend_status");
    expect(config.variant).toBe("secondary");
  });
});
