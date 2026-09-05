import { fetchIdPhotoUrlsBatched } from "@/app/client-api/id-photo-urls";
import { cardFileName } from "@/lib/id-card/file-name";
import { buildIdCardFromDataSheetRow } from "@/lib/id-card/build-id-card";
import { renderIdCardTemplateToDataUrl } from "@/lib/id-card/render-template";
import { buildVerifyUrl } from "@/lib/id-card/verify-url";
import { generateQrDataUrl } from "@/lib/id-card/qr";
import type { organizationType } from "@/types/organization";
import type { IdPhotoSubjectRow } from "@/types/data-sheets";
import {
  IdCardTemplateAudience,
  IdCardTemplateSide,
  templateHasBack,
  toIdCardTemplateSummary,
  type IdCardTemplateSummary,
} from "@/types/id-card-template";

export type IdCardSheetAudience = "student" | "staff";

export async function downloadIdCardsZipFromSheetRows(args: {
  rows: Array<IdPhotoSubjectRow & { roles?: string[] }>;
  tenant: organizationType;
  audience: IdCardSheetAudience;
  template: IdCardTemplateSummary;
  origin: string;
}): Promise<void> {
  const { downloadFile } = await import("@/helpers/file");
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const photoIds = args.rows.filter((row) => row.has_id_photo).map((row) => row.id);
  const photoUrls = await fetchIdPhotoUrlsBatched(photoIds, "full");

  for (const row of args.rows) {
    const photoUrl = photoUrls[String(row.id)] ?? null;
    const vm = buildIdCardFromDataSheetRow(
      row,
      args.tenant,
      args.audience,
      photoUrl,
    );
    const verifyUrl = buildVerifyUrl(args.origin, vm);
    const qrDataUrl = verifyUrl ? await generateQrDataUrl(verifyUrl) : "";
    const png = await renderIdCardTemplateToDataUrl({
      template: args.template,
      vm,
      qrDataUrl,
      verifyUrl: verifyUrl || undefined,
      photoUrl,
      side: IdCardTemplateSide.front,
    });
    const idx = png.indexOf("base64,") + "base64,".length;
    const content = png.substring(idx);
    zip.file(cardFileName(vm.name, "png"), content, { base64: true });

    if (templateHasBack(args.template)) {
      const backPng = await renderIdCardTemplateToDataUrl({
        template: args.template,
        vm,
        qrDataUrl,
        verifyUrl: verifyUrl || undefined,
        photoUrl,
        side: IdCardTemplateSide.back,
      });
      const backIdx = backPng.indexOf("base64,") + "base64,".length;
      zip.file(
        cardFileName(vm.name, "png", "back"),
        backPng.substring(backIdx),
        { base64: true },
      );
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  try {
    downloadFile(url, `${args.audience}-id-cards.zip`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function getActiveTemplateForAudience(
  tenant: organizationType | null | undefined,
  audience: IdCardSheetAudience,
): IdCardTemplateSummary | null {
  if (!tenant) return null;
  if (audience === "student") {
    return toIdCardTemplateSummary(tenant.active_student_id_card_template);
  }
  return toIdCardTemplateSummary(tenant.active_staff_id_card_template);
}

export { IdCardTemplateAudience };
