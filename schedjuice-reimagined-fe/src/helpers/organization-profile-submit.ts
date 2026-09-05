import {
  ORGANIZATION_MS_WRITE_ONLY_FIELD_KEYS,
  ORGANIZATION_TELEGRAM_WRITE_ONLY_FIELD_KEYS,
  VideoConferencingPlatform,
} from "@/types/organization";

const WRITE_ONLY_SKIP_IF_EMPTY = new Set<string>([
  ...ORGANIZATION_MS_WRITE_ONLY_FIELD_KEYS,
  ...ORGANIZATION_TELEGRAM_WRITE_ONLY_FIELD_KEYS,
]);

export type OrganizationOwnerFormValues = Record<string, unknown>;

export const ORGANIZATION_ID_CARD_FIELD_KEYS = [
  "id_card_org_name",
  "id_card_logo",
  "id_card_staff_accent",
  "id_card_student_accent",
] as const;

function trimIdCardString(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

/** Normalize ID card branding fields before org update (JSON or FormData). */
export function applyIdCardBrandingToPayload(
  payload: OrganizationOwnerFormValues,
  opts: { logoCleared?: boolean },
): void {
  payload.id_card_org_name = trimIdCardString(payload.id_card_org_name);
  payload.id_card_staff_accent = trimIdCardString(payload.id_card_staff_accent);
  payload.id_card_student_accent = trimIdCardString(payload.id_card_student_accent);

  if (opts.logoCleared) {
    payload.id_card_logo = null;
  } else {
    delete payload.id_card_logo;
  }
}

export function validateMicrosoftOwnerSetup(
  data: OrganizationOwnerFormValues,
  opts: { wasMicrosoftOnAtLoad: boolean },
): string | null {
  if (!data.is_microsoft_on) return null;

  const nonEmpty = (key: string) => {
    const v = data[key];
    return typeof v === "string" && v.trim().length > 0;
  };

  if (!nonEmpty("authority")) {
    return "Microsoft Authority is required when integration is enabled.";
  }
  if (!nonEmpty("app_id")) {
    return "Microsoft App ID is required when integration is enabled.";
  }
  if (!nonEmpty("tenant_id")) {
    return "Azure Tenant ID is required when integration is enabled.";
  }
  if (!opts.wasMicrosoftOnAtLoad && !nonEmpty("default_owner_id")) {
    return "Default meeting owner (Entra Object ID) is required when integration is enabled.";
  }

  if (!opts.wasMicrosoftOnAtLoad) {
    if (!nonEmpty("thumbprint")) {
      return "Certificate thumbprint is required for first-time Microsoft setup.";
    }
    if (!(data.private_key instanceof File)) {
      return "Private key (.pem) file is required for first-time Microsoft setup.";
    }
  }

  return null;
}

export function validateTelegramOwnerSetup(
  data: OrganizationOwnerFormValues,
  opts: { wasTelegramOnAtLoad: boolean; hasConnectedBot: boolean },
): string | null {
  if (!data.is_telegram_on) return null;

  const token =
    typeof data.telegram_bot_token === "string"
      ? data.telegram_bot_token.trim()
      : "";

  if (!opts.wasTelegramOnAtLoad && !token) {
    return "Telegram bot token is required when enabling Telegram for the first time.";
  }
  if (opts.wasTelegramOnAtLoad && !opts.hasConnectedBot && !token) {
    return "Telegram bot token is required — no bot is connected yet.";
  }

  if (data.is_telegram_login_on) {
    if (!opts.hasConnectedBot && !token) {
      return "Configure a Telegram bot before allowing Telegram login.";
    }
  }

  return null;
}

export function buildOrganizationOwnerFormData(
  data: OrganizationOwnerFormValues,
): FormData {
  const fd = new FormData();
  const payload: OrganizationOwnerFormValues = { ...data };
  delete payload.default_cover_image;

  if (!payload.is_telegram_on) {
    payload.is_telegram_login_on = false;
  }

  if (!payload.is_google_on) {
    payload.is_google_login_on = false;
  }

  if (
    payload.is_microsoft_on &&
    (payload.video_conferencing_platform == null ||
      payload.video_conferencing_platform === "")
  ) {
    payload.video_conferencing_platform =
      VideoConferencingPlatform.microsoft_teams;
  }

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;

    if (
      key === "id_card_logo" &&
      (value === null || value === "")
    ) {
      fd.append(key, "");
      continue;
    }

    if (
      (key === "id_card_org_name" ||
        key === "id_card_staff_accent" ||
        key === "id_card_student_accent") &&
      (value === null || value === "")
    ) {
      fd.append(key, "");
      continue;
    }

    if (value === null) continue;

    if (key === "private_key") {
      if (value instanceof File) {
        fd.append(key, value);
      }
      continue;
    }

    if (WRITE_ONLY_SKIP_IF_EMPTY.has(key)) {
      if (typeof value === "string" && value.trim() === "") continue;
    }

    if (Array.isArray(value)) {
      if (key === "available_domains") {
        value.forEach((item) => fd.append(key, String(item)));
      } else {
        fd.append(key, JSON.stringify(value));
      }
      continue;
    }

    if (typeof value === "boolean") {
      fd.append(key, value ? "true" : "false");
      continue;
    }

    if (typeof value === "object") {
      fd.append(key, JSON.stringify(value));
      continue;
    }

    const str = String(value).trim();
    if (str === "" && WRITE_ONLY_SKIP_IF_EMPTY.has(key)) continue;
    fd.append(key, String(value));
  }

  return fd;
}
