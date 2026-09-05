import * as z from "zod";
import { visibilitySchema } from "./visibility";
import { organizationType, VideoConferencingPlatform } from "./organization";

export const passwordRegex = RegExp(
  "^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).{8,}$"
);
export const passwordRegexMessage =
  "Password must have at least 8 characters, contains one number, one lowercase letter, one uppercase letter and one special character.";

export enum role {
  superadmin = "superadmin",
  admin = "admin",
  manager = "manager",
  teacher = "teacher",
  finance = "finance",
  hr = "hr",
  consultant = "consultant",

  student = "student",
}

export enum gender {
  MALE = "MALE",
  FEMALE = "FEMALE",
  NON_BINARY = "NON_BINARY",
  OTHER = "OTHER",
}
const roleEnum = z.nativeEnum(role);
const genderEnum = z.nativeEnum(gender);
export enum viewMode {
  table = "table",
  card = "card",
}
export const userSettingsSchema = z.object({
  default_view_mode: z.nativeEnum(viewMode).describe("Default View Mode"),
});

export const tempSchema = z.object({
  id: z.number(),
  code: z.string().optional().describe("User ID"),
  email: z.string().email(),
  communication_email: z.string().email().describe("Communication Email"),
  profile_image: z.string().optional().nullable(),
  cover_image: z.string().optional().nullable(),
  password: z.string(),
  name: z.string().max(500),
  alternative_name: z.string().max(500).optional().nullable().describe("Alternative Name"),
  roles: z.array(roleEnum),
  gender: genderEnum.nullable().optional().describe("Gender"),
  date_of_birth: z.coerce.date().nullable().optional().describe("Date of birth"),
  phone_number: z.string().max(512).describe("Phone number"),

  facebook_account_link: z
    .string()
    .url()
    .optional()
    .nullable()
    .describe("Facebook Account Link"),

  house_number: z.string().max(500).optional().nullable(),
  street: z.string().max(500).optional().nullable(),
  country: z.string().max(500).optional().nullable(),
  region: z.string().max(500).optional().nullable(),
  city: z.string().max(500).optional().nullable(),
  township: z.string().max(500).optional().nullable(),
  is_password_change_required: z.boolean(),
  is_active: z.boolean().optional(),
  visibility: z.number().optional(),

  emergency_contact_name: z
    .string()
    .max(500)
    .optional()
    .describe("Emergency contact name"),
  emergency_contact_phone_number: z
    .string()
    .max(512)
    .optional()
    .describe("Emergency contact phone number"),
  emergency_contact_relationship: z
    .string()
    .max(500)
    .optional()
    .describe("Emergency contact relationship"),
});
export enum userMicrosoftStatus {
  linked = "linked",
  unlicensed = "unlicensed",
  not_created = "not_created",
  domain_blocked = "domain_blocked",
  ms_off = "ms_off",
}

export enum userTelegramStatus {
  linked = "linked",
  not_linked = "not_linked",
  tg_off = "tg_off",
}

export enum userGoogleStatus {
  linked = "linked",
  not_linked = "not_linked",
  google_off = "google_off",
}

const accountSchema = tempSchema.and(userSettingsSchema).and(
  z.object({
    show_welcome_nav_hint: z.boolean().optional(),
    microsoft_id: z.string().nullable().optional(),
    microsoft_display_name: z.string().max(256).optional(),
    microsoft_license_assigned: z.boolean().optional(),
    microsoft_status: z.nativeEnum(userMicrosoftStatus).optional(),
    telegram_user_id: z.number().nullable().optional(),
    telegram_username: z.string().nullable().optional(),
    telegram_linked_at: z.string().nullable().optional(),
    telegram_status: z.nativeEnum(userTelegramStatus).optional(),
    google_id: z.string().nullable().optional(),
    google_linked_at: z.string().nullable().optional(),
    google_status: z.nativeEnum(userGoogleStatus).optional(),
    qualifications: z.any().optional().nullable(),
    is_public_profile_enabled: z.boolean().optional(),
    show_certifications_on_public_profile: z.boolean().optional(),
    public_profile_slug: z.string().optional().nullable(),
    permissions: z.array(z.string()).optional(),
    rbac_version: z.number().optional(),
    resigned_at: z.string().nullable().optional(),
    resignation_inform_date: z.string().nullable().optional(),
    resignation_last_working_date: z.string().nullable().optional(),
    resignation_type_of_pay: z
      .enum(["per_month", "per_session", "collaboration"])
      .nullable()
      .optional(),
    resignation_employment_type: z
      .enum(["part_time", "full_time"])
      .nullable()
      .optional(),
    resignation_remark: z.string().nullable().optional(),
    employment_type: z
      .enum(["part_time", "full_time", ""])
      .nullable()
      .optional(),
    blood_type: z
      .enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
      .nullable()
      .optional(),
    id_photo_url: z.string().nullable().optional(),
    profile_image_url: z.string().nullable().optional(),
    user_signature_url: z.string().nullable().optional(),
    id_verify_token: z.string().nullable().optional(),
    id_verify_code: z.string().nullable().optional(),
    id_card_class_name: z.string().nullable().optional(),
    id_card_class_display: z.string().nullable().optional(),
    id_card_expiry_display: z.string().nullable().optional(),
    scoped_program_ids: z.array(z.number()).optional(),
    scoped_category_ids: z.array(z.number()).optional(),
    user_write_mode: z.enum(["full", "steward", "none"]).optional().nullable(),
    writable_fields: z.array(z.string()).optional().nullable(),
  }),
);

export const studentSelfRegisterSchemaObject = z.object({
  name: z.string().max(500),
  alternative_name: z.string().max(500).optional().nullable().describe("Alternative Name"),
  password: z.string().regex(passwordRegex, passwordRegexMessage),
  confirm_password: z.string().describe("Confirm Password"),
  email: z.string().email(),
  communication_email: z.string().email().describe("Communication Email"),
  gender: genderEnum.nullable().optional().describe("Gender"),
  date_of_birth: z.coerce.date().nullable().optional().describe("Date of birth"),
  phone_number: z.string().max(512).describe("Phone number"),
  country: z.string().optional().nullable(),
});

export function withSelfRegisterPasswordMatch<T extends z.ZodTypeAny>(schema: T) {
  return schema.refine(
    (data: { password?: string; confirm_password?: string }) =>
      data.password === data.confirm_password,
    {
      message: "Passwords do not match.",
      path: ["confirm_password"],
    }
  );
}

export const studentSelfRegisterSchema = withSelfRegisterPasswordMatch(
  studentSelfRegisterSchemaObject
);

/** Inline admin check — do not import @/helpers/authorization here (it imports course → user → cycle). */
function isAdminManagerOrSuperForSchema(loggedInUser: accountType): boolean {
  const roles = loggedInUser?.roles;
  if (!roles?.length) return false;
  return (
    roles.includes(role.superadmin) ||
    roles.includes(role.admin) ||
    roles.includes(role.manager)
  );
}

function isAdminOrSuperForHrSchema(loggedInUser: accountType): boolean {
  const roles = loggedInUser?.roles;
  if (!roles?.length) return false;
  return roles.includes(role.superadmin) || roles.includes(role.admin);
}

/** If student is selected, it must be the only role (matches backend User.is_student()). */
export function withStudentRoleExclusivity<T extends z.ZodTypeAny>(schema: T) {
  return schema.refine(
    (data: { roles?: unknown }) => {
      const roles = data.roles;
      if (!Array.isArray(roles)) return true;
      if (!roles.includes(role.student)) return true;
      return roles.length === 1 && roles[0] === role.student;
    },
    {
      message: "Student role cannot be combined with other roles",
      path: ["roles"],
    }
  );
}

export const getUserSchema = (
  loggedInUser: accountType,
  tenant?: organizationType
): z.ZodObject<any, any, any, any, any> => {
  let base = accountEditSchema as z.ZodObject<any, any, any, any, any>;
  if (!tenant || !isAdminManagerOrSuperForSchema(loggedInUser)) {
    return base;
  }
  if (tenant.is_building_checkin_enabled) {
    base = base.merge(buildingCheckinFragment);
  }
  if (tenant.is_payroll_calculation_enabled) {
    base = base.merge(payrollFragment);
  }
  if (tenant.is_hr_fields_enabled && isAdminOrSuperForHrSchema(loggedInUser)) {
    base = base.merge(hrFragmentBase);
  }
  if (tenant.video_conferencing_platform === VideoConferencingPlatform.zoom) {
    base = base.merge(zoomUserIdentifierFragment);
  }
  if (tenant.is_microsoft_on) {
    base = base.merge(microsoftDisplayNameFragment);
  }
  return base;
};

export const dvrFieldSchema = tempSchema.pick({
  communication_email: true,
  alternative_name: true,
  date_of_birth: true,
  phone_number: true,
  house_number: true,
  street: true,
  township: true,
  city: true,
  region: true,
  country: true,
});

export const accountVisibilitySchema = tempSchema.pick({
  code: true,
  communication_email: true,
  alternative_name: true,
  roles: true,
  gender: true,
  date_of_birth: true,
  phone_number: true,
  house_number: true,
  street: true,
  township: true,
  city: true,
  region: true,
  country: true,
  facebook_account_link: true,
  emergency_contact_name: true,
  emergency_contact_phone_number: true,
  emergency_contact_relationship: true,
});

const accountCreateSchemaObject = z.object({
  name: z.string(),
  microsoft_display_name: z.string().max(256).optional(),
  alternative_name: z.string().max(500).optional().nullable(),
  email: z.string().email(),
  code: z.string().nullable().optional().describe("User ID"),

  communication_email: z.string().email().describe("Communication Email"),
  gender: genderEnum.optional(),

  date_of_birth: z.coerce.date().nullable().optional().describe("Date of birth"),

  phone_number: z.string().max(512).describe("Phone number"),

  facebook_account_link: z
    .string()
    .url()
    .optional()
    .nullable()
    .describe("Facebook Account Link"),

  house_number: z.string().max(500).optional().nullable(),
  street: z.string().max(500).optional().nullable(),
  country: z.string().max(500).optional().nullable(),
  region: z.string().max(500).optional().nullable(),
  city: z.string().max(500).optional().nullable(),
  township: z.string().max(500).optional().nullable(),
  roles: z.any(),
});
const accountCreateSchema = withStudentRoleExclusivity(accountCreateSchemaObject);
const accountBulkCreateSchema = tempSchema.pick({
  email: true,
  communication_email: true,
  name: true,
  alternative_name: true,
  gender: true,
  date_of_birth: true,
  phone_number: true,
  house_number: true,
  street: true,
  township: true,
  city: true,
  region: true,
  country: true,
  facebook_account_link: true,
});
export const emergencyContactSchema = tempSchema.pick({
  emergency_contact_name: true,
  emergency_contact_phone_number: true,
  emergency_contact_relationship: true,
});

const accountBulkCreatePartialSchema = z.object({
  roles: z.any(),
});

export type accountType = typeof accountSchema._type;

const buildingCheckinFragment = z.object({
  preferred_checkin_time: z.string().nullable().optional().describe("Preferred Checkin Time"),
  preferred_checkout_time: z.string().nullable().optional().describe("Preferred Checkout time"),
  access_log_name: z.string().max(256).nullable().optional().describe("Name from Access Log"),
});

const payrollFragment = z.object({
  working_hour_per_month: z.coerce.number().nullable().optional().describe("Working Hour Per Month"),
  salary: z.coerce.number().nullable().optional().describe("Salary"),
  per_session_rate: z.coerce.number().nullable().optional().describe("Per Session Rate"),
  per_hour_rate: z.coerce.number().nullable().optional().describe("Per Hour Rate"),
  student_bonus_hourly_rate: z.coerce.number().nullable().optional().describe("Student Bonus Hourly Rate"),
});

const hrFragmentBase = z.object({
  contract_expiry_date: z.coerce.date().nullable().optional().describe("Contract Expiry Date"),
  probation_end_date: z.coerce.date().nullable().optional().describe("Probation End Date"),
  employment_start_date: z.coerce.date().nullable().optional().describe("Employement Start Date"),
  employment_type: z.enum(["part_time", "full_time", ""]).nullable().optional().describe("Employment Type"),
});

const zoomUserIdentifierFragment = z.object({
  zoom_user_identifier: z
    .string()
    .max(512)
    .optional()
    .nullable()
    .describe(
      "Zoom attendance match: same value Zoom returns on the participant report (often sign-in email, or user_id / participant id).",
    ),
});

const microsoftDisplayNameFragment = z.object({
  microsoft_display_name: z
    .string()
    .max(256)
    .optional()
    .describe("Microsoft display name"),
});

export const publicProfileFragment = z.object({
  qualifications: z.any().optional().nullable(),
  is_public_profile_enabled: z.boolean().optional(),
  show_certifications_on_public_profile: z.boolean().optional(),
  public_profile_slug: z.string().optional().nullable(),
});

const accountEditSchema = z.object({  
  email: z.string().email(),
  communication_email: z.string().email(),
  code: z.string().nullable().optional().describe("User ID"),

  phone_number: z.string().max(512).describe("Phone number"),
  name: z.string(),
  alternative_name: z.string().max(500).optional().nullable(),
  gender: genderEnum,
  date_of_birth: z.coerce.date().nullable().optional().describe("Date of birth"),
  roles: z.any(),

  facebook_account_link: z
    .string()
    .url()
    .optional()
    .nullable()
    .describe("Facebook Account Link"),

  house_number: z.string().max(500).optional().nullable(),
  street: z.string().max(500).optional().nullable(),
  country: z.string().max(500).optional().nullable(),
  region: z.string().max(500).optional().nullable(),
  city: z.string().max(500).optional().nullable(),
  township: z.string().max(500).optional().nullable(),
});

export {
  accountSchema,
  accountEditSchema,
  accountCreateSchema,
  accountCreateSchemaObject,
  accountBulkCreateSchema,
  accountBulkCreatePartialSchema,
};

export enum RegistrationStep {
  EMAIL = "EMAIL",
  OTP = "OTP",
  INFO = "INFO",
  SUCCESS = "SUCCESS",
}
