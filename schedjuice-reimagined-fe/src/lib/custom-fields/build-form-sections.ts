import type { FormConfig, FormConfigGroup, FormSurface } from "@/types/form-config";

export type HardcodedSectionId =
  | "identity"
  | "checkin"
  | "payroll"
  | "hr"
  | "zoom"
  | "public_profile";

export type FormSection =
  | { kind: "identity"; id: "identity"; title: string; description?: string }
  | { kind: "config"; id: string; title: string; group: FormConfigGroup }
  | {
      kind: Exclude<HardcodedSectionId, "identity">;
      id: Exclude<HardcodedSectionId, "identity">;
      title: string;
      description?: string;
    };

export const OPERATIONAL_SECTIONS: {
  id: Exclude<HardcodedSectionId, "identity">;
  title: string;
  description?: string;
  keys: string[];
}[] = [
  {
    id: "checkin",
    title: "Building check-in",
    keys: ["preferred_checkin_time", "preferred_checkout_time", "access_log_name"],
  },
  {
    id: "payroll",
    title: "Payroll",
    keys: ["working_hour_per_month", "salary", "per_session_rate", "per_hour_rate", "student_bonus_hourly_rate"],
  },
  {
    id: "hr",
    title: "HR",
    keys: ["contract_expiry_date", "probation_end_date", "employment_start_date", "employment_type"],
  },
  { id: "zoom", title: "Zoom attendance", keys: ["zoom_user_identifier"] },
];

export function buildFormSections(
  config: FormConfig,
  opts: {
    surface: FormSurface;
    availableKeys: Set<string>;
    subjectIsStaff?: boolean;
  }
): FormSection[] {
  const sections: FormSection[] = [
    {
      kind: "identity",
      id: "identity",
      title: "Profile",
      description: "Name, contact, and access details.",
    },
  ];

  for (const group of config.groups) {
    if (group.fields.length === 0) continue;
    sections.push({
      kind: "config",
      id: `config:${group.id ?? "general"}`,
      title: group.name,
      group,
    });
  }

  if (opts.surface !== "create") {
    for (const op of OPERATIONAL_SECTIONS) {
      if (op.keys.some((k) => opts.availableKeys.has(k))) {
        sections.push({ kind: op.id, id: op.id, title: op.title, description: op.description });
      }
    }

    if (opts.subjectIsStaff) {
      sections.push({
        kind: "public_profile",
        id: "public_profile",
        title: "Public Profile",
        description:
          "Share your name, photo, qualifications, and certifications with anyone via a public link.",
      });
    }
  }

  return sections;
}

/** Split create flow: step one is identity; step two is everything else. */
export function splitCreateFormSections(sections: FormSection[]) {
  const identitySections = sections.filter((s) => s.kind === "identity");
  const additionalSections = sections.filter((s) => s.kind !== "identity");
  return { identitySections, additionalSections };
}
