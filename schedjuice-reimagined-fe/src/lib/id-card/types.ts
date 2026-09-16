export type CardRole = "staff" | "student";

type CardEmergency = {
  name: string | null;
  phone: string;
  relationship: string | null;
};

export type CardViewModel = {
  name: string;
  email: string;
  roleLabel: string;
  role: CardRole;
  accent: string;
  photoUrl: string | null;
  initials: string;
  orgName: string;
  orgLogoUrl: string | null;
  bloodType: string | null;
  emergency: CardEmergency | null;
  verifyToken: string | null;
  verifyCode: string | null;
  studentId: string | null;
  className: string | null;
  courseTitle: string | null;
  expiresOn: string | null;
};

export const DEFAULT_STAFF_ACCENT = "#5ea37e";
export const DEFAULT_STUDENT_ACCENT = "#d97706";
export const DEFAULT_ORG_LOGO = "/images/schedjuice-logo-new.svg";
