import {
  canAccessPlatformOrganizations,
  hasAdminCredentials,
} from "@/helpers/authorization";
import { canViewOrgAiSection } from "@/lib/org/org-ai-visibility";
import {
  VideoConferencingPlatform,
  type organizationType,
} from "@/types/organization";
import type { accountType } from "@/types/user";

export type OrgSectionGroup =
  | "top"
  | "school"
  | "access"
  | "courses"
  | "integrations"
  | "feature-toggles"
  | "localizations"
  | "intelligence"
  | "platform";

export type OrgSectionId =
  | "overview"
  | "profile"
  | "branding"
  | "id-cards"
  | "login-domains"
  | "courses"
  | "microsoft"
  | "telegram"
  | "google"
  | "consultation"
  | "video"
  | "library"
  | "crm"
  | "chat"
  | "checkin"
  | "staff-payroll"
  | "reports"
  | "invoicing"
  | "region-time"
  | "currency"
  | "ai"
  | "billing"
  | "admins";

export type OrgRecordMode = "tenant" | "platform";

export type OrgRecordContext = {
  mode: OrgRecordMode;
  viewer: accountType;
  tenant: organizationType | null | undefined;
};

export type OrgSettingsSubGroup = {
  id: string;
  title: string;
  description?: string;
  keys: readonly string[];
};

export type OrgOverviewChipGroup = "integrations" | "feature-toggles" | "intelligence";

export type OrgSettingsRegistryEntry = {
  id: OrgSectionId;
  label: string;
  group: OrgSectionGroup;
  title: string;
  description?: string;
  subGroups?: readonly OrgSettingsSubGroup[];
  customPanel?: "overview" | "branding" | "ai" | "billing" | "admins";
  overviewChips?: readonly {
    chipGroup: OrgOverviewChipGroup;
    label: string;
    value: (org: organizationType) => string;
    pane?: "settings" | "usage" | "failures" | "requests";
  }[];
  visible?: (ctx: OrgRecordContext) => boolean;
};

const MS_KEYS = [
  "is_microsoft_on",
  "is_teams_creation_enabled",
  "is_teams_attendance_sync_enabled",
  "authority",
  "app_id",
  "tenant_id",
  "thumbprint",
  "private_key",
  "certificate_id",
  "client_secret",
  "default_owner_id",
  "delegated_account_upn",
  "delegated_account_password",
  "delegated_account_object_id",
  "staff_license_id",
  "student_license_id",
  "meeting_sensitivity_label_id",
] as const;

const CHECKIN_KEYS = [
  "is_building_checkin_enabled",
  "use_student_attendance",
  "use_student_checkin",
  "use_teacher_session_checkin",
  "allow_teacher_checkin_history_correction",
  "allow_teacher_checkin_cancellation",
  "course_data_health_session_lookback",
  "campus_checkin_verification_mode",
  "checkin_grace_period_minute",
] as const;

function adminOnly(ctx: OrgRecordContext): boolean {
  return hasAdminCredentials(ctx.viewer);
}

function videoLabel(org: organizationType): string {
  if (org.video_conferencing_platform === VideoConferencingPlatform.microsoft_teams) {
    return "Teams";
  }
  if (org.video_conferencing_platform === VideoConferencingPlatform.zoom) {
    return "Zoom";
  }
  return "None";
}

export const ORG_SETTINGS_REGISTRY: readonly OrgSettingsRegistryEntry[] = [
  {
    id: "overview",
    label: "Overview",
    group: "top",
    title: "Overview",
    customPanel: "overview",
    visible: () => true,
  },
  {
    id: "profile",
    label: "Profile",
    group: "school",
    title: "School profile",
    description: "Name and messaging shown on your school's pages.",
    subGroups: [
      {
        id: "profile-fields",
        title: "School profile",
        keys: ["name", "description", "tagline"],
      },
    ],
    visible: adminOnly,
  },
  {
    id: "branding",
    label: "Branding",
    group: "school",
    title: "Branding",
    customPanel: "branding",
    visible: adminOnly,
  },
  {
    id: "id-cards",
    label: "ID cards",
    group: "school",
    title: "ID cards",
    description: "Branding on staff and student ID badges (name, logo, accent colors).",
    subGroups: [
      {
        id: "id-card-fields",
        title: "ID cards",
        keys: [
          "id_card_org_name",
          "id_card_logo",
          "id_card_staff_accent",
          "id_card_student_accent",
          "is_course_id_card_expiry_enabled",
        ],
      },
    ],
    visible: adminOnly,
  },
  {
    id: "login-domains",
    label: "Login & domains",
    group: "access",
    title: "Login & domains",
    description: "Control who can log in and which email domains new accounts may use.",
    subGroups: [
      {
        id: "login",
        title: "Login",
        description: "Control which roles can sign in.",
        keys: ["is_student_login_disabled"],
      },
      {
        id: "email-domains",
        title: "Email domains",
        description: "New accounts must use an email address at one of these domains.",
        keys: ["available_domains"],
      },
    ],
    visible: adminOnly,
  },
  {
    id: "courses",
    label: "Courses",
    group: "courses",
    title: "Courses",
    description: "Course creation policies, scheduling defaults, and course form behavior.",
    subGroups: [
      {
        id: "policies-roles",
        title: "Policies & roles",
        description: "Who can create courses and how teachers are assigned.",
        keys: [
          "can_teacher_create_course",
          "auto_assign_creator_as_main_teacher",
          "is_course_role_enabled",
          "is_substitute_teachers_enabled",
        ],
      },
      {
        id: "teaching-subjects",
        title: "Teaching subjects",
        keys: ["teaching_subjects_allow_level_category_search"],
      },
      {
        id: "scheduling-defaults",
        title: "Scheduling defaults",
        description: "Default session times and weekday nomenclature for new courses.",
        keys: [
          "default_session_start_time",
          "default_session_duration_minutes",
          "is_wd_we_course_types_enabled",
        ],
      },
      {
        id: "course-display",
        title: "Course display",
        keys: [
          "is_fm_hm_course_display_enabled",
          "is_exam_board_in_course_enabled",
          "warn_on_long_course_duration",
        ],
      },
    ],
    visible: adminOnly,
  },
  {
    id: "microsoft",
    label: "Microsoft Teams",
    group: "integrations",
    title: "Microsoft Teams integration",
    description:
      "Enable Microsoft sign-in and Graph features. Optionally auto-create Teams classes for new courses.",
    subGroups: [{ id: "microsoft-fields", title: "Microsoft Teams integration", keys: MS_KEYS }],
    overviewChips: [
      {
        chipGroup: "integrations",
        label: "Microsoft",
        value: (org) => (org.is_microsoft_on ? "On" : "Off"),
      },
    ],
    visible: adminOnly,
  },
  {
    id: "telegram",
    label: "Telegram",
    group: "integrations",
    title: "Telegram integration",
    description:
      "Teacher-facing Telegram bot for course groups, announcements, and invite DMs.",
    subGroups: [
      {
        id: "telegram-fields",
        title: "Telegram integration",
        keys: [
          "is_telegram_on",
          "is_telegram_login_on",
          "is_telegram_roster_sync_enabled",
          "telegram_bot_username",
          "telegram_bot_token",
        ],
      },
    ],
    overviewChips: [
      {
        chipGroup: "integrations",
        label: "Telegram",
        value: (org) =>
          org.is_telegram_on
            ? org.telegram_bot_username
              ? `@${String(org.telegram_bot_username).replace(/^@/, "")}`
              : "On"
            : "Off",
      },
    ],
    visible: adminOnly,
  },
  {
    id: "google",
    label: "Google",
    group: "integrations",
    title: "Google integration",
    description: "Allow users to connect Google on their profile and sign in with Google once linked.",
    subGroups: [
      {
        id: "google-fields",
        title: "Google integration",
        keys: ["is_google_on", "is_google_login_on"],
      },
    ],
    overviewChips: [
      {
        chipGroup: "integrations",
        label: "Google",
        value: (org) => (org.is_google_on ? "On" : "Off"),
      },
    ],
    visible: adminOnly,
  },
  {
    id: "consultation",
    label: "Consultation",
    group: "integrations",
    title: "Consultation booking",
    description: "Let consultants share booking links for student sessions.",
    subGroups: [
      {
        id: "consultation-fields",
        title: "Consultation booking",
        keys: ["is_consultation_booking_on", "consultation_strategy"],
      },
    ],
    overviewChips: [
      {
        chipGroup: "integrations",
        label: "Consultation",
        value: (org) => (org.is_consultation_booking_on ? "On" : "Off"),
      },
    ],
    visible: adminOnly,
  },
  {
    id: "video",
    label: "Video meetings",
    group: "integrations",
    title: "Video meetings",
    description: "Default platform for class meetings.",
    subGroups: [
      {
        id: "video-fields",
        title: "Video meetings",
        keys: ["video_conferencing_platform"],
      },
    ],
    overviewChips: [
      {
        chipGroup: "integrations",
        label: "Video",
        value: videoLabel,
      },
    ],
    visible: adminOnly,
  },
  {
    id: "library",
    label: "Library",
    group: "feature-toggles",
    title: "Library",
    description: "Enable the library module and customize its title.",
    subGroups: [
      {
        id: "library-fields",
        title: "Library",
        keys: ["is_library_disabled", "library_title"],
      },
    ],
    overviewChips: [
      {
        chipGroup: "feature-toggles",
        label: "Library",
        value: (org) => (org.is_library_disabled ? "Off" : "On"),
      },
    ],
    visible: adminOnly,
  },
  {
    id: "crm",
    label: "CRM",
    group: "feature-toggles",
    title: "CRM",
    description: "Leads and Issues boards for admissions and support tracking.",
    subGroups: [
      {
        id: "crm-module",
        title: "Module",
        keys: ["is_crm_enabled"],
      },
      {
        id: "crm-notifications",
        title: "Notifications",
        description: "Email alerts for people watching leads or issues.",
        keys: [
          "notify_lead_observers_on_status_change",
          "notify_issue_observers_on_status_change",
        ],
      },
    ],
    overviewChips: [
      {
        chipGroup: "feature-toggles",
        label: "CRM",
        value: (org) => (org.is_crm_enabled ? "On" : "Off"),
      },
    ],
    visible: adminOnly,
  },
  {
    id: "chat",
    label: "Class chats",
    group: "feature-toggles",
    title: "Student–teacher class chats",
    description:
      "Private group chats between each enrolled student and their course teachers (main and assistant). Replaces whole-roster course chat for this school.",
    subGroups: [
      {
        id: "chat-fields",
        title: "Class chats",
        keys: ["is_student_teacher_group_chat_enabled"],
      },
      {
        id: "dm-fields",
        title: "Direct messages",
        keys: [
          "is_students_dm_admins_only_enabled",
          "student_dm_contact_user_id",
        ],
      },
    ],
    overviewChips: [
      {
        chipGroup: "feature-toggles",
        label: "Class chats",
        value: (org) =>
          org.is_student_teacher_group_chat_enabled ? "On" : "Off",
      },
      {
        chipGroup: "feature-toggles",
        label: "Students DM admins only",
        value: (org) =>
          org.is_students_dm_admins_only_enabled ? "On" : "Off",
      },
      {
        chipGroup: "feature-toggles",
        label: "Student DM contact",
        value: (org) =>
          org.student_dm_contact_user_id != null ? "Assigned" : "Not set",
      },
    ],
    visible: adminOnly,
  },
  {
    id: "checkin",
    label: "Attendance tracking",
    group: "feature-toggles",
    title: "Attendance tracking",
    description:
      "Campus check-in, student attendance vs check-in modes, and teacher session check-in.",
    subGroups: [{ id: "checkin-fields", title: "Attendance tracking", keys: CHECKIN_KEYS }],
    overviewChips: [
      {
        chipGroup: "feature-toggles",
        label: "Check-in",
        value: (org) => (org.is_building_checkin_enabled ? "On" : "Off"),
      },
    ],
    visible: adminOnly,
  },
  {
    id: "staff-payroll",
    label: "Staff & payroll",
    group: "feature-toggles",
    title: "Staff & payroll",
    description: "Payroll calculation, HR fields, staff points, and alumni settings.",
    subGroups: [
      {
        id: "payroll",
        title: "Payroll",
        keys: [
          "is_payroll_calculation_enabled",
          "payroll_calculation_strategy",
          "supports_course_specific_rates",
          "can_teacher_see_self_earnings",
        ],
      },
      {
        id: "hr-staff-points",
        title: "HR & staff points",
        keys: ["is_hr_fields_enabled", "is_staff_points_enabled"],
      },
      {
        id: "alumni",
        title: "Alumni",
        keys: ["alumni_grace_period_day", "cost_per_account_per_day"],
      },
    ],
    overviewChips: [
      {
        chipGroup: "feature-toggles",
        label: "Payroll",
        value: (org) => (org.is_payroll_calculation_enabled ? "On" : "Off"),
      },
      {
        chipGroup: "feature-toggles",
        label: "Staff points",
        value: (org) => (org.is_staff_points_enabled ? "On" : "Off"),
      },
    ],
    visible: adminOnly,
  },
  {
    id: "reports",
    label: "Reports",
    group: "feature-toggles",
    title: "Reports",
    description: "Templates and styles for exported reports and data sheets.",
    subGroups: [
      {
        id: "reports-fields",
        title: "Reports",
        keys: ["report_style", "course_sheet_template"],
      },
    ],
    visible: adminOnly,
  },
  {
    id: "invoicing",
    label: "Invoicing",
    group: "feature-toggles",
    title: "Invoicing",
    description: "Payment plans, discounts, payment capture, and invoice automation.",
    subGroups: [
      {
        id: "payment-plans",
        title: "Payment plans",
        keys: ["default_student_payment_plan", "is_payment_plan_mandatory"],
      },
      {
        id: "discounts",
        title: "Discounts",
        keys: ["is_legacy_discount_visible", "is_discount_eligibility_enabled"],
      },
      {
        id: "payment-capture",
        title: "Payment capture",
        keys: ["transaction_screenshot_strategy"],
      },
      {
        id: "invoice-generation",
        title: "Invoice generation",
        keys: ["invoice_generation_strategy", "invoice_generation_interval_days"],
      },
    ],
    visible: adminOnly,
  },
  {
    id: "region-time",
    label: "Region & time",
    group: "localizations",
    title: "Region & time",
    description: "Timezone and how clock times appear across the app.",
    subGroups: [
      {
        id: "region-time-fields",
        title: "Region & time",
        keys: ["timezone", "time_display_format"],
      },
    ],
    visible: adminOnly,
  },
  {
    id: "currency",
    label: "Currency",
    group: "localizations",
    title: "Currency",
    description: "How money amounts are labeled for this school.",
    subGroups: [
      {
        id: "currency-fields",
        title: "Currency",
        keys: ["currency_fullname", "currency_symbol", "currency_iso4217"],
      },
    ],
    visible: adminOnly,
  },
  {
    id: "ai",
    label: "AI",
    group: "intelligence",
    title: "AI",
    customPanel: "ai",
    overviewChips: [
      {
        chipGroup: "intelligence",
        label: "AI",
        value: () => "Enabled",
        pane: "settings",
      },
    ],
    visible: (ctx) => canViewOrgAiSection(ctx),
  },
  {
    id: "billing",
    label: "Billing",
    group: "platform",
    title: "Billing",
    customPanel: "billing",
    visible: (ctx) =>
      ctx.mode === "platform" &&
      Boolean(ctx.tenant && canAccessPlatformOrganizations(ctx.viewer, ctx.tenant)),
  },
  {
    id: "admins",
    label: "Admins",
    group: "platform",
    title: "Admins",
    customPanel: "admins",
    visible: (ctx) =>
      ctx.mode === "platform" &&
      Boolean(ctx.tenant && canAccessPlatformOrganizations(ctx.viewer, ctx.tenant)),
  },
];

export const ORG_SECTION_IDS = ORG_SETTINGS_REGISTRY.map((e) => e.id);

export function isOrgSectionId(value: string): value is OrgSectionId {
  return (ORG_SECTION_IDS as string[]).includes(value);
}

export function getRegistryEntry(sectionId: string): OrgSettingsRegistryEntry | undefined {
  return ORG_SETTINGS_REGISTRY.find((e) => e.id === sectionId);
}

export function getRegistryFlatKeys(sectionId: string): readonly string[] {
  const entry = getRegistryEntry(sectionId);
  if (!entry?.subGroups?.length) return [];
  return entry.subGroups.flatMap((g) => [...g.keys]);
}

export const ORG_GROUP_LABELS: Record<Exclude<OrgSectionGroup, "top">, string> = {
  school: "School",
  access: "Access",
  courses: "Courses",
  integrations: "Integrations",
  "feature-toggles": "Feature toggles",
  localizations: "Localizations",
  intelligence: "Intelligence",
  platform: "Platform",
};

export const ORG_GROUP_ORDER: Exclude<OrgSectionGroup, "top">[] = [
  "school",
  "access",
  "courses",
  "integrations",
  "feature-toggles",
  "localizations",
  "intelligence",
  "platform",
];

export const SCHEMA_SECTION_IDS = ORG_SETTINGS_REGISTRY.filter(
  (e) => !e.customPanel && e.subGroups?.length,
).map((e) => e.id);

export function isSchemaSectionId(
  section: string,
): section is OrgSectionId & (typeof SCHEMA_SECTION_IDS)[number] {
  return (SCHEMA_SECTION_IDS as readonly string[]).includes(section);
}

export const DEFAULT_ORG_SECTION: OrgSectionId = "overview";

export type OrgSectionDef = {
  id: OrgSectionId;
  label: string;
  group: OrgSectionGroup;
  visible: (ctx: OrgRecordContext) => boolean;
};

export const ORG_SECTIONS: OrgSectionDef[] = ORG_SETTINGS_REGISTRY.map((e) => ({
  id: e.id,
  label: e.label,
  group: e.group,
  visible: e.visible ?? (() => true),
}));

export function visibleOrgSections(ctx: OrgRecordContext): OrgSectionDef[] {
  return ORG_SECTIONS.filter((s) => s.visible(ctx));
}

export function resolveOrgSection(raw: string, ctx: OrgRecordContext): OrgSectionId {
  if (!isOrgSectionId(raw)) return DEFAULT_ORG_SECTION;
  const visible = visibleOrgSections(ctx).map((s) => s.id);
  return visible.includes(raw) ? raw : DEFAULT_ORG_SECTION;
}

export const OVERVIEW_CHIP_GROUP_LABELS: Record<OrgOverviewChipGroup, string> = {
  integrations: "Integrations",
  "feature-toggles": "Feature toggles",
  intelligence: "Intelligence",
};

export const OVERVIEW_CHIP_GROUP_ORDER: OrgOverviewChipGroup[] = [
  "integrations",
  "feature-toggles",
  "intelligence",
];
