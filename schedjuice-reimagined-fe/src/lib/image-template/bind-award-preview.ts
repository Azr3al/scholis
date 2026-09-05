import { formatPreviewDate, type AwardPreviewBinder } from "./preview-binder";

export type MainTeacherPreview = {
  name: string;
  signatureUrl: string | null;
};

export function bindAwardPreview(input: {
  studentName: string;
  courseName: string;
  awardTitle: string;
  gender?: string | null;
  awardImageUrl?: string | null;
  mtName?: string;
  mtSignatureUrl?: string | null;
}): AwardPreviewBinder {
  const dated = formatPreviewDate(new Date());
  return {
    studentName: input.studentName,
    courseName: input.courseName,
    awardTitle: input.awardTitle,
    gender: input.gender ?? null,
    awardImageUrl: input.awardImageUrl ?? null,
    period: dated,
    currentDate: dated,
    mtName: input.mtName ?? "",
    mtSignatureUrl: input.mtSignatureUrl ?? null,
    namedUsers: {},
  };
}

function firstNamedUser(payload: unknown): {
  name: string;
  user_signature_url?: unknown;
} | null {
  const list = (payload as { data?: { data?: unknown } } | undefined)?.data
    ?.data;
  if (!Array.isArray(list)) return null;
  for (const row of list) {
    const user = (row as { user?: { name?: unknown; user_signature_url?: unknown } })
      .user;
    const name = typeof user?.name === "string" ? user.name.trim() : "";
    if (!name) continue;
    return { name, user_signature_url: user?.user_signature_url };
  }
  return null;
}

export function readMainTeacher(payload: unknown): MainTeacherPreview {
  const user = firstNamedUser(payload);
  const signature =
    typeof user?.user_signature_url === "string"
      ? user.user_signature_url.trim()
      : "";
  return {
    name: user?.name ?? "",
    signatureUrl: signature.length > 0 ? signature : null,
  };
}

export function readMainTeacherName(payload: unknown): string {
  return readMainTeacher(payload).name;
}
