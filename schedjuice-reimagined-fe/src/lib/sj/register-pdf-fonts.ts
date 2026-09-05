/**
 * Register Schedjuice fonts for @react-pdf/renderer.
 *
 * react-pdf/fontkit cannot parse WOFF2 (throws DataView bounds errors).
 * Use TTF files under public/fonts/pdf/ — see PDF_TTF_FILES below.
 */
let pdfFontsRegistered = false;

function resolveFontSrc(relativePath: string): string {
  if (typeof window !== "undefined") {
    return new URL(relativePath, window.location.origin).href;
  }
  return relativePath;
}

/** Self-hosted TTF paths (OFL fonts; not committed — drop files locally). */
export const PDF_TTF_FILES = {
  sansRegular: "/fonts/pdf/noto-sans-regular.ttf",
  sansSemibold: "/fonts/pdf/noto-sans-semibold.ttf",
  sansBold: "/fonts/pdf/noto-sans-bold.ttf",
  serifSemibold: "/fonts/pdf/fraunces-semibold.ttf",
  monoRegular: "/fonts/pdf/ibm-plex-mono-regular.ttf",
  monoMedium: "/fonts/pdf/ibm-plex-mono-medium.ttf",
} as const;

export type PdfFontFamilies = {
  sans: string;
  serif: string;
  mono: string;
  emphasis: string;
  /** Set when emphasis shares `sans` and uses fontWeight (custom TTF stack). */
  emphasisWeight?: number;
  monoWeight?: number;
};

/** Built-in PDF standard fonts — always safe, no fetch/parse. */
export const PDF_FONT_BUILTIN: PdfFontFamilies = {
  sans: "Helvetica",
  serif: "Helvetica-Bold",
  mono: "Courier",
  emphasis: "Helvetica-Bold",
};

/** Registered Schedjuice stacks — only after TTF registration succeeds. */
export const PDF_FONT_SCHEDJUICE: PdfFontFamilies = {
  sans: "Schedjuice Sans",
  serif: "Schedjuice Serif",
  mono: "Schedjuice Mono",
  emphasis: "Schedjuice Sans",
  emphasisWeight: 600,
  monoWeight: 500,
};

async function schedjuiceTtfAvailable(): Promise<boolean> {
  try {
    const response = await fetch(resolveFontSrc(PDF_TTF_FILES.sansRegular), {
      method: "HEAD",
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function registerSchedjuicePdfFontsTtf(): Promise<void> {
  if (pdfFontsRegistered) {
    return;
  }

  const { Font } = await import("@react-pdf/renderer");

  Font.register({
    family: "Schedjuice Sans",
    fonts: [
      {
        src: resolveFontSrc(PDF_TTF_FILES.sansRegular),
        fontWeight: 400,
      },
      {
        src: resolveFontSrc(PDF_TTF_FILES.sansSemibold),
        fontWeight: 600,
      },
      {
        src: resolveFontSrc(PDF_TTF_FILES.sansBold),
        fontWeight: 700,
      },
    ],
  });

  Font.register({
    family: "Schedjuice Serif",
    fonts: [
      {
        src: resolveFontSrc(PDF_TTF_FILES.serifSemibold),
        fontWeight: 600,
      },
    ],
  });

  Font.register({
    family: "Schedjuice Mono",
    fonts: [
      {
        src: resolveFontSrc(PDF_TTF_FILES.monoRegular),
        fontWeight: 400,
      },
      {
        src: resolveFontSrc(PDF_TTF_FILES.monoMedium),
        fontWeight: 500,
      },
    ],
  });

  pdfFontsRegistered = true;
}

/**
 * Register custom fonts when TTF files exist; otherwise use built-in PDF fonts.
 * Never registers WOFF2 — that crashes fontkit with DataView errors.
 */
export async function preparePdfFonts(): Promise<PdfFontFamilies> {
  if (!(await schedjuiceTtfAvailable())) {
    return PDF_FONT_BUILTIN;
  }

  try {
    await registerSchedjuicePdfFontsTtf();
    return PDF_FONT_SCHEDJUICE;
  } catch {
    return PDF_FONT_BUILTIN;
  }
}

/** Test hook — reset module state between Vitest cases. */
export function __resetPdfFontsRegisteredForTests(): void {
  pdfFontsRegistered = false;
}
