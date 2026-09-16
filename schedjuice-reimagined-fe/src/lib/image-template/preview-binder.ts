import { pronounForGender } from "./pronoun";

export type NamedUserPreview = {
  name: string;
  signatureUrl: string | null;
};

export type AwardPreviewBinder = {
  studentName: string;
  awardTitle: string;
  period: string;
  courseName: string;
  gender: string | null;
  awardImageUrl: string | null;
  currentDate: string;
  mtName: string;
  mtSignatureUrl: string | null;
  namedUsers: Record<number, NamedUserPreview>;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatPreviewDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export const SAMPLE_AWARD_BINDER: AwardPreviewBinder = {
  studentName: "Alex Rivera",
  awardTitle: "Top 1",
  period: "May 2026",
  courseName: "Sample course",
  gender: "FEMALE",
  awardImageUrl: "/images/award-photo-placeholder.png",
  currentDate: formatPreviewDate(new Date()),
  mtName: "Main Teacher",
  mtSignatureUrl: null,
  namedUsers: {},
};

export { pronounForGender };
