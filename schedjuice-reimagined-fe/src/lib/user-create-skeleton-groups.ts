import type { AutoFormGroup } from "@/components/auto-form";

/**
 * Mirrors UserForm create step 1: a single "Profile" identity section
 * (profile + access fields together — see buildFormSections / renderUserSectionFields).
 * UserForm stays hand-composed; skeletons only need matching group + footer layout.
 */
export const USER_CREATE_SKELETON_GROUPS: AutoFormGroup[] = [
  {
    id: "identity",
    title: "Profile",
    description: "Name, contact, and access details.",
    fields: [
      "name",
      "microsoft_display_name",
      "email",
      "communication_email",
      "phone_number",
      "roles",
      "code",
    ],
  },
];
