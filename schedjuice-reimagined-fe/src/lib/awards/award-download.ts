import type { AwardDisplayTemplate } from "@/types/award";

function slugPart(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "award"
  );
}

export function awardPngFileName(input: {
  studentName: string;
  titleName: string;
  periodKey: string;
}): string {
  return `${slugPart(input.studentName)}_${slugPart(input.titleName)}_${slugPart(input.periodKey)}.png`;
}

export function awardsZipFileName(courseTitle: string, periodKey: string): string {
  return `${slugPart(courseTitle)}-awards-${slugPart(periodKey)}.zip`;
}

export type AwardPngInput = {
  studentName: string;
  titleName: string;
  periodKey: string;
  display_template: AwardDisplayTemplate | null;
};

export async function collectAwardPngs(
  rows: AwardPngInput[],
  compositeRow: (
    row: AwardPngInput & { display_template: AwardDisplayTemplate },
  ) => Promise<string>,
): Promise<
  | { ok: true; files: Array<{ name: string; pngDataUrl: string }> }
  | { ok: false }
> {
  const renderable = rows.filter(
    (row): row is AwardPngInput & { display_template: AwardDisplayTemplate } =>
      row.display_template != null,
  );
  const files: Array<{ name: string; pngDataUrl: string }> = [];
  try {
    for (const row of renderable) {
      const pngDataUrl = await compositeRow(row);
      files.push({
        name: awardPngFileName(row),
        pngDataUrl,
      });
    }
    return { ok: true, files };
  } catch {
    return { ok: false };
  }
}

export async function downloadPngDataUrl(
  pngDataUrl: string,
  filename: string,
): Promise<void> {
  const { downloadFile } = await import("@/helpers/file");
  downloadFile(pngDataUrl, filename);
}

export async function downloadAwardsZip(args: {
  files: Array<{ name: string; pngDataUrl: string }>;
  zipName: string;
}): Promise<void> {
  const { downloadFile } = await import("@/helpers/file");
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const file of args.files) {
    const idx = file.pngDataUrl.indexOf("base64,") + "base64,".length;
    zip.file(file.name, file.pngDataUrl.substring(idx), { base64: true });
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  try {
    downloadFile(url, args.zipName);
  } finally {
    URL.revokeObjectURL(url);
  }
}
