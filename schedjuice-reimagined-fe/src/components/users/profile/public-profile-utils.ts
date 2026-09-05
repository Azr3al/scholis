export function hasQualificationsContent(
  qualifications: Record<string, unknown> | null | undefined,
): boolean {
  if (!qualifications || typeof qualifications !== "object") return false;
  const content = qualifications.content;
  if (!Array.isArray(content) || content.length === 0) return false;
  return content.some((node) => {
    if (!node || typeof node !== "object") return false;
    const text = (node as { content?: unknown[] }).content;
    if (Array.isArray(text) && text.length > 0) return true;
    if ((node as { type?: string }).type === "image") return true;
    return false;
  });
}

export function profileInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

export function toPublicCertifications(
  certs: {
    title: string;
    issuing_organization: string;
    issued_on: string;
    expires_on: string | null;
    attachment_url?: string | null;
    attachment_filename?: string | null;
  }[],
) {
  return certs.map((cert) => ({
    title: cert.title,
    issuing_organization: cert.issuing_organization,
    issued_on: cert.issued_on,
    expires_on: cert.expires_on,
    file_url: cert.attachment_url ?? null,
    file_filename: cert.attachment_filename ?? null,
  }));
}
