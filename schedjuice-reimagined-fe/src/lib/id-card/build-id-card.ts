import type { accountType } from "@/types/user";
import { role } from "@/types/user";
import type { IdPhotoSubjectRow, StudentCourseChip } from "@/types/data-sheets";
import type { organizationType } from "@/types/organization";
import {
  CardRole,
  CardViewModel,
  DEFAULT_ORG_LOGO,
  DEFAULT_STAFF_ACCENT,
  DEFAULT_STUDENT_ACCENT,
} from "./types";

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Admin",
  admin: "Admin",
  manager: "Manager",
  hr: "HR",
  finance: "Finance",
  teacher: "Teacher",
  student: "Student",
};

const STAFF_ROLE_PRIORITY = [
  "superadmin",
  "admin",
  "manager",
  "hr",
  "finance",
  "teacher",
];

function isStudentOnly(roles: string[]): boolean {
  return roles.length === 1 && roles[0] === "student";
}

function resolveRole(roles: string[]): CardRole {
  if (isStudentOnly(roles)) return "student";
  return "staff";
}

function resolveRoleLabel(roles: string[], cardRole: CardRole): string {
  if (cardRole === "student") return "Student";
  const top = STAFF_ROLE_PRIORITY.find((r) => roles.includes(r));
  if (top) return ROLE_LABEL[top];
  return "Staff";
}

/** Shared role → display label (reused by the public verify page). */
export function cardRoleLabel(roles: string[]): string {
  return resolveRoleLabel(roles, resolveRole(roles));
}

function resolveAccent(cardRole: CardRole, tenant: organizationType): string {
  if (cardRole === "student") {
    return tenant.id_card_student_accent || DEFAULT_STUDENT_ACCENT;
  }
  return tenant.id_card_staff_accent || DEFAULT_STAFF_ACCENT;
}

function resolvePhoto(account: accountType): string | null {
  return (
    account.id_photo_url ||
    account.profile_image_url ||
    account.profile_image ||
    null
  );
}

function resolveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function resolveEmergency(account: accountType): CardViewModel["emergency"] {
  const phone = account.emergency_contact_phone_number;
  if (!phone) return null;
  return {
    name: account.emergency_contact_name || null,
    phone,
    relationship: account.emergency_contact_relationship || null,
  };
}

type DataSheetIdCardRow = IdPhotoSubjectRow & {
  roles?: string[];
  courses?: StudentCourseChip[];
};

function resolveSheetExpiry(row: DataSheetIdCardRow): string | null {
  return row.id_card_expiry_display ?? null;
}

function resolveSheetClassName(row: DataSheetIdCardRow): string | null {
  if (row.id_card_class_name != null && row.id_card_class_name !== "") {
    return row.id_card_class_name;
  }
  if (row.id_card_class_name === "") {
    return null;
  }
  return row.id_card_class_display ?? null;
}

function resolveStudentCardFields(
  account: accountType,
  cardRole: CardRole,
): Pick<CardViewModel, "studentId" | "className" | "courseTitle" | "expiresOn"> {
  if (cardRole !== "student") {
    return { studentId: null, className: null, courseTitle: null, expiresOn: null };
  }
  const code = account.code?.trim();
  return {
    studentId: code || null,
    className: account.id_card_class_display ?? null,
    courseTitle: null,
    expiresOn: account.id_card_expiry_display ?? null,
  };
}

/** Sample student fields for branding previews when the viewer lacks real data. */
const ID_CARD_PREVIEW_SAMPLE_STUDENT_ID = "S001";
const ID_CARD_PREVIEW_SAMPLE_CLASS = "Year 1";
const ID_CARD_PREVIEW_SAMPLE_COURSE = "Introduction to Biology";

/** Build a preview card for settings UI with a forced staff or student role. */
export function buildIdCardPreview(
  account: accountType,
  tenant: organizationType,
  previewRole: CardRole,
): CardViewModel {
  const roles =
    previewRole === "student" ? [role.student] : [role.teacher];
  let previewAccount: accountType = { ...account, roles };
  if (previewRole === "student") {
    previewAccount = {
      ...previewAccount,
      code: previewAccount.code?.trim() || ID_CARD_PREVIEW_SAMPLE_STUDENT_ID,
      id_card_class_display:
        previewAccount.id_card_class_display ?? ID_CARD_PREVIEW_SAMPLE_CLASS,
    };
  }
  const vm = buildIdCard(previewAccount, tenant);
  if (previewRole === "student") {
    return { ...vm, courseTitle: ID_CARD_PREVIEW_SAMPLE_COURSE };
  }
  return vm;
}

export function buildIdCardFromDataSheetRow(
  row: DataSheetIdCardRow,
  tenant: organizationType,
  audience: "student" | "staff",
  photoUrl?: string | null,
): CardViewModel {
  const roles =
    audience === "student" ? [role.student] : ((row.roles ?? []) as string[]);

  const account = {
    name: row.name ?? "",
    email: row.communication_email ?? "",
    code: row.code ?? null,
    roles,
    id_photo_url: photoUrl ?? null,
    profile_image_url: null,
    profile_image: null,
    blood_type: row.blood_type,
    emergency_contact_name: row.emergency_contact_name,
    emergency_contact_phone_number: row.emergency_contact_phone_number,
    emergency_contact_relationship: row.emergency_contact_relationship,
    id_verify_token: row.id_verify_token,
    id_verify_code: row.id_verify_code,
    id_card_class_display: resolveSheetClassName(row),
    id_card_expiry_display: resolveSheetExpiry(row),
  } as accountType;

  const vm = buildIdCard(account, tenant);
  return { ...vm, courseTitle: row.courses?.[0]?.title ?? null };
}

export function buildIdCard(
  account: accountType,
  tenant: organizationType,
): CardViewModel {
  const roles = (account.roles ?? []) as string[];
  const cardRole = resolveRole(roles);
  const studentFields = resolveStudentCardFields(account, cardRole);
  return {
    name: account.name,
    email: account.email,
    role: cardRole,
    roleLabel: resolveRoleLabel(roles, cardRole),
    accent: resolveAccent(cardRole, tenant),
    photoUrl: resolvePhoto(account),
    initials: resolveInitials(account.name),
    orgName: tenant.id_card_org_name || tenant.name,
    orgLogoUrl: tenant.id_card_logo || tenant.logo || DEFAULT_ORG_LOGO,
    bloodType: account.blood_type ?? null,
    emergency: resolveEmergency(account),
    verifyToken: account.id_verify_token ?? null,
    verifyCode: account.id_verify_code ?? null,
    ...studentFields,
  };
}
