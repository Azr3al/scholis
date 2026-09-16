import { getOrgSchemaSectionKeys } from "@/config/organization-profile-sections";
import {
  applyIdCardBrandingToPayload,
  buildOrganizationOwnerFormData,
  validateMicrosoftOwnerSetup,
  validateTelegramOwnerSetup,
} from "@/helpers/organization-profile-submit";

export function pickOrgSectionValues(
  sectionId: string,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const keys = getOrgSchemaSectionKeys(sectionId);
  if (!keys) return {};
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in values) out[key] = values[key];
  }
  return out;
}

export function buildOrgSectionFormData(
  sectionId: string,
  values: Record<string, unknown>,
  opts?: { idCardLogoCleared?: boolean },
): FormData {
  const payload = pickOrgSectionValues(sectionId, values);
  if (sectionId === "id-cards") {
    applyIdCardBrandingToPayload(payload, {
      logoCleared: opts?.idCardLogoCleared ?? false,
    });
  }
  return buildOrganizationOwnerFormData(payload);
}

export function buildCombinedOrgFormData(
  sectionIds: readonly string[],
  values: Record<string, unknown>,
  opts?: { idCardLogoCleared?: boolean },
): FormData {
  const payload: Record<string, unknown> = {};
  for (const sectionId of sectionIds) {
    Object.assign(payload, pickOrgSectionValues(sectionId, values));
  }
  if (sectionIds.includes("id-cards")) {
    applyIdCardBrandingToPayload(payload, {
      logoCleared: opts?.idCardLogoCleared ?? false,
    });
  }
  return buildOrganizationOwnerFormData(payload);
}

export function validateOrgSectionsForSave(
  sectionIds: readonly string[],
  values: Record<string, unknown>,
  opts: {
    wasMicrosoftOnAtLoad: boolean;
    wasTelegramOnAtLoad: boolean;
    hasConnectedBot: boolean;
  },
): string | null {
  for (const sectionId of sectionIds) {
    if (sectionId === "microsoft") {
      const payload = pickOrgSectionValues(sectionId, values);
      const error = validateMicrosoftOwnerSetup(payload, {
        wasMicrosoftOnAtLoad: opts.wasMicrosoftOnAtLoad,
      });
      if (error) return error;
    }
    if (sectionId === "telegram") {
      const payload = pickOrgSectionValues(sectionId, values);
      const error = validateTelegramOwnerSetup(payload, {
        wasTelegramOnAtLoad: opts.wasTelegramOnAtLoad,
        hasConnectedBot: opts.hasConnectedBot,
      });
      if (error) return error;
    }
  }
  return null;
}
