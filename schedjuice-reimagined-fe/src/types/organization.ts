import * as z from "zod";
import { themeSchema } from "@/types/theme";

export enum TransactionScreenshotStrategy {
  user_upload = "user_upload",
  admin_upload = "admin_upload",
}

export enum InvoiceGenerationStrategy {
  tr_phillips_style = "tr_phillips_style",
}

export enum DefaultStudentPaymentPlan {
  single_month = "single_month",
  multiple_months = "multiple_months",
  installment = "installment",
}

export enum ReportStyle {
  TR_SU_STYLE = "TR_SU_STYLE",
  TR_PHILLIPS_STYLE = "TR_PHILLIPS_STYLE",
  EXCELLENT_CHOICE_STYLE = "EXCELLENT_CHOICE_STYLE",
}

export enum CourseSheetTemplate {
  teacher_su = "teacher_su",
}

export enum PayrollCalculationStrategy {
  tr_phillips = "tr_phillips",
  session_based = "session_based",
}

export enum VideoConferencingPlatform {
  microsoft_teams = "microsoft_teams",
  zoom = "zoom",
  google_meet = "google_meet",
}

export enum CampusCheckinVerificationMode {
  geo_with_selfie_fallback = "geo_with_selfie_fallback",
  geo_only = "geo_only",
  selfie_only = "selfie_only",
}

export enum TimeDisplayFormat {
  "12h" = "12h",
  "24h" = "24h",
}

export enum ConsultationStrategy {
  lwtp = "lwtp",
}

const organizationFieldsSchema = z.object({
  id: z.number(),
  name: z.string(),
  logo: z.string().optional().nullable().describe("Logo"),
  id_card_org_name: z
    .string()
    .nullable()
    .optional()
    .describe("Display school name on ID cards"),
  id_card_logo: z.string().nullable().optional().describe("ID card logo"),
  id_card_staff_accent: z
    .string()
    .nullable()
    .optional()
    .describe("Staff accent color"),
  id_card_student_accent: z
    .string()
    .nullable()
    .optional()
    .describe("Student accent color"),
  is_course_id_card_expiry_enabled: z
    .boolean()
    .default(false)
    .describe("Per-course ID card expiry date on course forms"),
  active_student_id_card_template: z
    .object({
      id: z.number(),
      name: z.string(),
      audience: z.string(),
      width_in: z.number(),
      height_in: z.number(),
      background_url: z.string().nullable().optional(),
      slots: z.array(z.record(z.unknown())),
      back_background_url: z.string().nullable().optional(),
      back_slots: z.array(z.record(z.unknown())).optional(),
      academic_year: z.string().nullable().optional(),
      expires_on: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  active_staff_id_card_template: z
    .object({
      id: z.number(),
      name: z.string(),
      audience: z.string(),
      width_in: z.number(),
      height_in: z.number(),
      background_url: z.string().nullable().optional(),
      slots: z.array(z.record(z.unknown())),
      back_background_url: z.string().nullable().optional(),
      back_slots: z.array(z.record(z.unknown())).optional(),
      academic_year: z.string().nullable().optional(),
      expires_on: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  description: z.string(),
  tagline: z.string(),
  domain_url: z.string().describe("Domain"),
  is_admin: z.boolean(),
  is_demo: z.boolean().default(false).describe("Demo/sandbox tenant"),
  available_domains: z
    .array(z.string())
    .describe("Approved email domains"),
  default_cover_image: z
    .string()
    .optional()
    .nullable()
    .describe("Default cover image")
    .or(z.object({})),

  is_homepage_disabled: z.boolean().describe("Disable Home Page"),
  is_student_login_disabled: z.boolean().describe("Disable student login"),
  is_library_disabled: z.boolean().describe("Disable library"),
  can_teacher_create_course: z
    .boolean()
    .describe("Allow teachers to create courses"),
  auto_assign_creator_as_main_teacher: z
    .boolean()
    .default(false)
    .describe("Auto-assign creator as main teacher"),
  is_course_role_enabled: z
    .boolean()
    .default(true)
    .describe("Enable course roles (MT/AT)"),
  is_substitute_teachers_enabled: z
    .boolean()
    .default(false)
    .describe("Enable substitute teacher roles"),
  warn_on_long_course_duration: z
    .boolean()
    .default(false)
    .describe("Warn when creating a class longer than 30 days"),
  teaching_subjects_allow_level_category_search: z
    .boolean()
    .default(false)
    .describe("Allow level and category in teaching subjects"),

  // microsoft stuffs
  is_microsoft_on: z.boolean().describe("Enable Microsoft Integration"),
  is_teams_creation_enabled: z
    .boolean()
    .default(true)
    .describe("Create Microsoft Teams for new courses"),
  is_teams_attendance_sync_enabled: z
    .boolean()
    .default(false)
    .describe("Sync Microsoft Teams meeting attendance into teacher payroll records"),
  video_conferencing_platform: z
    .nativeEnum(VideoConferencingPlatform)
    .nullable()
    .optional()
    .describe("Primary video conferencing platform"),

  has_connected_zoom_account: z
    .boolean()
    .optional()
    .describe("At least one active Zoom account connected (read-only)"),

  authority: z.string().optional().nullable().describe("Microsoft Authority"),
  app_id: z.string().optional().nullable().describe("Microsoft App ID"),
  tenant_id: z
    .string()
    .optional()
    .nullable()
    .describe("Azure AD Tenant ID (GUID)"),
  thumbprint: z
    .string()
    .optional()
    .nullable()
    .describe("App registration certificate thumbprint"),
  certificate_id: z
    .string()
    .optional()
    .nullable()
    .describe("Certificate ID (optional)"),
  private_key: z
    .any()
    .optional()
    .describe("Private key (.pem) — upload to set or replace"),
  client_secret: z
    .string()
    .optional()
    .nullable()
    .describe("Client secret (optional if using certificate auth)"),
  staff_license_id: z
    .string()
    .optional()
    .nullable()
    .describe("Entra license SKU for staff provisioning"),
  student_license_id: z
    .string()
    .optional()
    .nullable()
    .describe("Entra license SKU for student provisioning"),
  default_owner_id: z
    .string()
    .optional()
    .nullable()
    .describe(
      "Entra user Object ID for Teams meeting organizer (Users > Object ID, not App ID)",
    ),
  delegated_account_upn: z
    .string()
    .optional()
    .nullable()
    .describe(
      "Entra sign-in UPN for delegated Graph flows (password reset, assignments, channel messages)",
    ),
  delegated_account_password: z
    .string()
    .optional()
    .nullable()
    .describe("Password for delegated_account_upn"),
  delegated_account_object_id: z
    .string()
    .optional()
    .nullable()
    .describe(
      "Entra Object ID of delegated_account_upn (for /users/{id}/ paths in delegated meeting flows)",
    ),
  meeting_sensitivity_label_id: z
    .string()
    .optional()
    .nullable()
    .describe("Purview sensitivity label ID for recording access (optional)"),

  // telegram integration
  is_telegram_on: z.boolean().default(false).describe("Enable Telegram integration"),
  is_telegram_login_on: z
    .boolean()
    .default(false)
    .describe("Allow sign-in with Telegram on the login page"),
  is_telegram_roster_sync_enabled: z
    .boolean()
    .default(true)
    .describe("Sync teacher membership in Telegram groups"),
  telegram_bot_username: z
    .string()
    .optional()
    .nullable()
    .describe("Connected bot username (read-only)"),
  telegram_bot_token: z
    .string()
    .optional()
    .describe("Telegram bot token from BotFather — paste to set or rotate"),
  telegram_bot_id: z
    .string()
    .optional()
    .nullable()
    .describe("Connected bot numeric id (read-only)"),

  // google integration
  is_google_on: z.boolean().default(false).describe("Enable Google integration"),
  is_google_login_on: z
    .boolean()
    .default(false)
    .describe("Allow sign-in with Google on the login page"),

  is_consultation_booking_on: z
    .boolean()
    .default(false)
    .describe("Enable consultation booking"),
  consultation_strategy: z
    .nativeEnum(ConsultationStrategy)
    .default(ConsultationStrategy.lwtp)
    .describe("Default schedule preset"),

  report_style: z.nativeEnum(ReportStyle).optional().nullable().describe("Report Style"),
  course_sheet_template: z
    .nativeEnum(CourseSheetTemplate)
    .nullable()
    .optional()
    .describe("Course data sheet template"),

  // library stuffs
  library_title: z.string().describe("Library title"),

  is_building_checkin_enabled: z
    .boolean()
    .default(false)
    .describe("Building Check-in"),
  use_student_attendance: z
    .boolean()
    .default(true)
    .describe("Student attendance marking"),
  use_student_checkin: z
    .boolean()
    .default(false)
    .describe("Student manual session check-in"),
  use_teacher_session_checkin: z
    .boolean()
    .default(true)
    .describe("Teacher session check-in"),
  allow_teacher_checkin_history_correction: z
    .boolean()
    .default(false)
    .describe("Teacher check-in history corrections"),
  allow_teacher_checkin_cancellation: z
    .boolean()
    .default(false)
    .describe("Teacher check-in cancellation"),
  course_data_health_session_lookback: z.coerce
    .number()
    .int()
    .positive()
    .default(5)
    .describe("Past sessions to check for missing data"),
  campus_checkin_verification_mode: z
    .nativeEnum(CampusCheckinVerificationMode)
    .default(CampusCheckinVerificationMode.geo_with_selfie_fallback)
    .describe("Campus check-in verification"),
  checkin_grace_period_minute: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(5)
    .describe("Check-in Grace Period (Minutes)"),
  is_payroll_calculation_enabled: z
    .boolean()
    .default(false)
    .describe("Payroll Calculation"),
  payroll_calculation_strategy: z
    .nativeEnum(PayrollCalculationStrategy)
    .default(PayrollCalculationStrategy.tr_phillips)
    .describe("Payroll Calculation Strategy"),
  supports_course_specific_rates: z
    .boolean()
    .default(false)
    .describe("Course-Specific Hourly Rates"),
  is_hr_fields_enabled: z.boolean().default(false).describe("HR Fields"),
  is_staff_points_enabled: z.boolean().default(false).describe("Staff Points"),
  is_crm_enabled: z.boolean().default(false).describe("Enable CRM"),
  is_student_teacher_group_chat_enabled: z
    .boolean()
    .default(false)
    .describe("Student–teacher class chats"),
  is_students_dm_admins_only_enabled: z
    .boolean()
    .default(false)
    .describe("Students DM admins only"),
  student_dm_contact_user_id: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .describe("Student DM contact"),
  notify_lead_observers_on_status_change: z
    .boolean()
    .default(true)
    .describe("Email lead observers when status changes"),
  notify_issue_observers_on_status_change: z
    .boolean()
    .default(true)
    .describe("Email issue observers when status changes"),
  can_teacher_see_self_earnings: z
    .boolean()
    .default(false)
    .describe("Can Teacher See Self Earnings"),
  transaction_screenshot_strategy: z
    .nativeEnum(TransactionScreenshotStrategy)
    .default(TransactionScreenshotStrategy.user_upload)
    .describe("Transaction Screenshot Strategy"),
  default_student_payment_plan: z
    .nativeEnum(DefaultStudentPaymentPlan)
    .default(DefaultStudentPaymentPlan.single_month)
    .describe("Default Student Payment Plan"),
  is_fm_hm_course_display_enabled: z
    .boolean()
    .default(false)
    .describe("Full-month / half-month course display and filters"),
  is_wd_we_course_types_enabled: z
    .boolean()
    .default(false)
    .describe(
      "When on, scheduling uses WD (Mon–Thu) and WE (Sat–Sun) instead of individual weekdays. Friday stays on Custom schedule.",
    ),
  is_payment_plan_mandatory: z
    .boolean()
    .default(false)
    .describe("Require a payment plan on every course"),
  is_exam_board_in_course_enabled: z
    .boolean()
    .default(false)
    .describe("Show exam board in course"),
  is_legacy_discount_visible: z
    .boolean()
    .default(false)
    .describe("Show legacy discount and per-hour price fields on payment plans"),
  is_discount_eligibility_enabled: z
    .boolean()
    .default(true)
    .describe("Discount eligibility rules"),
  invoice_generation_strategy: z
    .nativeEnum(InvoiceGenerationStrategy)
    .nullable()
    .optional()
    .default(null)
    .describe("Invoice Generation Strategy"),
  invoice_generation_interval_days: z.coerce
    .number()
    .default(30)
    .describe("Invoice Generation Interval (days)"),

  alumni_grace_period_day: z.coerce
    .number()
    .int()
    .nonnegative()
    .nullable()
    .optional()
    .describe("Alumni Grace Period (days)"),
  cost_per_account_per_day: z.coerce
    .number()
    .int()
    .nonnegative()
    .nullable()
    .optional()
    .describe("Cost Per Account Per Day"),

  timezone: z.string().describe("Timezone (E.g Asia/Rangoon, Asia/Bangkok)"),
  time_display_format: z
    .nativeEnum(TimeDisplayFormat)
    .default(TimeDisplayFormat["12h"])
    .describe("Time display format"),

  default_session_start_time: z
    .string()
    .nullable()
    .optional()
    .describe("Default class start time (HH:MM)"),
  default_session_duration_minutes: z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .describe("Default class duration (minutes)"),

  currency_fullname: z.string().default("Myanmar Kyat").describe("Display name for tenant currency"),
  currency_symbol: z.string().default("Ks").describe("Symbol for money display"),
  currency_iso4217: z.string().default("MMK").describe("ISO 4217 code"),

  program_count: z.number().optional(),
  theme: themeSchema.optional().nullable().describe("Organization theme colors"),
});

const organizationSchema = organizationFieldsSchema;

const organizationCreateSchema = organizationFieldsSchema.pick({
  name: true,
  logo: true,
  description: true,
  tagline: true,
  domain_url: true,
  is_microsoft_on: true,
  authority: true,
  app_id: true,
});

const organizationEditSchema = organizationFieldsSchema.omit({
  id: true,
  logo: true,
  default_cover_image: true,
  domain_url: true,
  is_admin: true,
  has_connected_zoom_account: true,
});

const organizationOwnerEditSchema = organizationFieldsSchema
  .omit({
  id: true,
  is_admin: true,
  logo: true,
  default_cover_image: true,
  domain_url: true,
  is_homepage_disabled: true,
  has_connected_zoom_account: true,
  program_count: true,
})
  .superRefine((data, ctx) => {
    if (data.use_student_attendance && data.use_student_checkin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Student attendance marking and student check-in cannot both be enabled.",
        path: ["use_student_checkin"],
      });
    }
  });

/** Write-only on API; never hydrate from GET responses. */
export const ORGANIZATION_MS_WRITE_ONLY_FIELD_KEYS = [
  "thumbprint",
  "certificate_id",
  "private_key",
  "client_secret",
  "staff_license_id",
  "student_license_id",
  "default_owner_id",
  "delegated_account_upn",
  "delegated_account_password",
  "delegated_account_object_id",
] as const;

/** Write-only on API; never hydrate from GET responses. */
export const ORGANIZATION_TELEGRAM_WRITE_ONLY_FIELD_KEYS = [
  "telegram_bot_token",
] as const;

export type organizationType = z.infer<typeof organizationSchema>;

export {
  organizationSchema,
  organizationCreateSchema,
  organizationEditSchema,
  organizationOwnerEditSchema,
};
