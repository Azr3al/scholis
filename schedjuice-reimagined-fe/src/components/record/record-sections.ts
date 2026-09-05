import { canViewCertificationsSection } from "@/lib/certifications/visibility";
import { canViewConsultationSection } from "@/lib/consultation/visibility";
import { canViewPointsSection } from "@/lib/points/visibility";
import { canViewAiSection } from "@/lib/ai/visibility";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

export type RecordSectionId =
  | "overview"
  | "academic"
  | "certifications"
  | "finance"
  | "records"
  | "points"
  | "ai"
  | "consultation"
  | "access"
  | "settings";

export type RecordSectionContext = {
  tenant: organizationType | null | undefined;
  subject: accountType;
  viewer: accountType;
};

export type RecordSection = {
  id: RecordSectionId;
  label: string;
  /** Whether this section shows for the given subject and viewer. */
  visible: (ctx: RecordSectionContext) => boolean;
};

export const RECORD_SECTIONS: RecordSection[] = [
  { id: "overview", label: "Overview", visible: () => true },
  { id: "academic", label: "Academic", visible: () => true },
  {
    id: "certifications",
    label: "Certifications",
    visible: canViewCertificationsSection,
  },
  { id: "finance", label: "Finance", visible: () => true },
  { id: "records", label: "Records", visible: () => true },
  {
    id: "points",
    label: "Points",
    visible: canViewPointsSection,
  },
  {
    id: "ai",
    label: "AI",
    visible: canViewAiSection,
  },
  {
    id: "consultation",
    label: "Consultation",
    visible: canViewConsultationSection,
  },
  { id: "access", label: "Access", visible: () => true },
  {
    id: "settings",
    label: "Settings",
    visible: ({ subject, viewer }) => subject.id === viewer.id,
  },
];

export const RECORD_SECTION_IDS: RecordSectionId[] = RECORD_SECTIONS.map(
  (s) => s.id,
);

export const DEFAULT_SECTION: RecordSectionId = "overview";

export function visibleSections(ctx: RecordSectionContext): RecordSection[] {
  return RECORD_SECTIONS.filter((s) => s.visible(ctx));
}

export function isRecordSectionId(value: string): value is RecordSectionId {
  return (RECORD_SECTION_IDS as string[]).includes(value);
}
