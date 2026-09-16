import { cardToPngDataUrl } from "@/lib/id-card/raster";
import { cardFileName } from "@/lib/id-card/file-name";
import type { CardViewModel } from "@/lib/id-card/types";
import type { IdCardTemplateSummary } from "@/types/id-card-template";

export type CardExportOptions = {
  template?: IdCardTemplateSummary | null;
};

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/data:(.*);base64/)?.[1] ?? "image/png";
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function downloadCardPng(
  vm: CardViewModel,
  qrDataUrl: string,
  options?: CardExportOptions,
): Promise<void> {
  const { downloadFile } = await import("@/helpers/file");
  const png = await cardToPngDataUrl(vm, qrDataUrl, options);
  const url = URL.createObjectURL(dataUrlToBlob(png));
  try {
    downloadFile(url, cardFileName(vm.name, "png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadCardPdf(
  vm: CardViewModel,
  qrDataUrl: string,
  options?: CardExportOptions,
): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { IdCardSinglePdf } = await import("@/components/id-card/id-card-pdf");
  const { downloadFile } = await import("@/helpers/file");

  const png = await cardToPngDataUrl(vm, qrDataUrl, options);
  const blob = await pdf(IdCardSinglePdf({ pngDataUrl: png })).toBlob();
  const url = URL.createObjectURL(blob);
  try {
    downloadFile(url, cardFileName(vm.name, "pdf"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type BulkCardInput = {
  vm: CardViewModel;
  qrDataUrl: string;
  template?: IdCardTemplateSummary | null;
};

export async function downloadBulkCardsPdf(
  items: BulkCardInput[],
  options?: CardExportOptions,
): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { IdCardBulkPdf } = await import("@/components/id-card/id-card-pdf");
  const { downloadFile } = await import("@/helpers/file");

  const pngDataUrls: string[] = [];
  for (const item of items) {
    pngDataUrls.push(
      await cardToPngDataUrl(item.vm, item.qrDataUrl, {
        template: item.template ?? options?.template,
      }),
    );
  }
  const blob = await pdf(IdCardBulkPdf({ pngDataUrls })).toBlob();
  const url = URL.createObjectURL(blob);
  try {
    downloadFile(url, `id-cards-${items.length}.pdf`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
