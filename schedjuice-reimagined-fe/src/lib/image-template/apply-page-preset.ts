import { applyPresetCoverFit } from "./cover-fit";
import { IDENTITY_FILL } from "./award-document";
import { sizeForPreset } from "./page-presets";
import type { BackgroundFill, PagePreset, TemplateDocument } from "./types";

const CUSTOM_MAX = 8192;

function coverPage(
  fill: BackgroundFill,
  imageSize: { width: number; height: number },
  page: { width: number; height: number },
): BackgroundFill {
  return applyPresetCoverFit(fill, imageSize, page);
}

export function coverReplaceFill(
  url: string | null,
  imageSize: { width: number; height: number },
  page: { width: number; height: number },
): BackgroundFill {
  // Start below min cover scale so clampBackgroundFill snaps to true cover, not 8× zoom.
  const fitted = coverPage(
    { url, offsetX: 0, offsetY: 0, scale: 0 },
    imageSize,
    page,
  );
  const drawnW = imageSize.width * fitted.scale;
  const drawnH = imageSize.height * fitted.scale;
  return coverPage(
    {
      ...fitted,
      offsetX: (page.width - drawnW) / 2,
      offsetY: (page.height - drawnH) / 2,
    },
    imageSize,
    page,
  );
}

export function applyPagePreset(
  doc: TemplateDocument,
  preset: PagePreset,
  imageSize: { width: number; height: number },
  custom?: { width: number; height: number },
): TemplateDocument {
  if (doc.kind === "id_card") {
    if (preset !== "id_cr80_portrait" && preset !== "id_cr80_landscape") {
      return doc;
    }
    const size = sizeForPreset(preset);
    const page = { width: size.width, height: size.height };
    return {
      ...doc,
      width: size.width,
      height: size.height,
      pagePreset: preset,
      background: {
        front: coverPage(doc.background.front, imageSize, page),
        back: coverPage(doc.background.back, imageSize, page),
      },
    };
  }

  if (preset === "custom") {
    const width = custom?.width ?? 0;
    const height = custom?.height ?? 0;
    if (width < 1 || height < 1 || width > CUSTOM_MAX || height > CUSTOM_MAX) {
      throw new Error("Custom size must be between 1 and 8192");
    }
    const page = { width, height };
    return {
      ...doc,
      width,
      height,
      pagePreset: "custom",
      background: coverPage(doc.background, imageSize, page),
    };
  }

  if (preset === "original") {
    const page = { width: imageSize.width, height: imageSize.height };
    return {
      ...doc,
      width: page.width,
      height: page.height,
      pagePreset: "original",
      background: coverPage({ ...doc.background, ...IDENTITY_FILL }, imageSize, page),
    };
  }

  if (preset === "hd_16_9" || preset === "a4_landscape") {
    const size = sizeForPreset(preset);
    const page = { width: size.width, height: size.height };
    return {
      ...doc,
      width: size.width,
      height: size.height,
      pagePreset: preset,
      background: coverPage(doc.background, imageSize, page),
    };
  }

  return doc;
}
