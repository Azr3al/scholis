/**
 * Work around MathLive export quirks that confuse KaTeX layout (duplicate * atoms, stretchy `\sqrt` vinculum spanning the editor).
 *
 * - Single-digit `\sqrt` uses compact `\sqrt3`; duplicates become `\sqrt33`.
 * - Braced form can duplicate as `\sqrt{3}3`.
 * - After deduping, braced `\sqrt{d}` avoids KaTeX stretchy surd bugs on bare `\sqrt3`.
 * - Same-digit fractions: `\frac{3}{3}33`.
 *
 * `(?!\d)` after the radicand digit avoids altering `\sqrt121` (KaTeX reads as `\sqrt{1}21`).
 */
export function normalizeMathliveKatexLatex(latex: string): string {
  let s = latex.trim();
  s = s.replace(
    /\\sqrt(?:\[(\d+)\])?\{(\d+)\}\2(?!\d)/g,
    (_, idx: string | undefined, rad: string) =>
      idx != null ? `\\sqrt[${idx}]{${rad}}` : `\\sqrt{${rad}}`,
  );
  s = s.replace(/\\sqrt(\d)\1(?!\d)/g, (_, d: string) => `\\sqrt{${d}}`);
  s = s.replace(/\\sqrt(\d)(?!\d)/g, (_, d: string) => `\\sqrt{${d}}`);
  const sameDigitDup = /^\\(?:d|t)?frac\{(\d)\}\{\1\}\1\1$/;
  if (sameDigitDup.test(s)) {
    s = s.replace(sameDigitDup, (_m, d: string) => `\\frac{${d}}{${d}}`);
  }
  return s;
}

/** Private markers — must not occur in real LaTeX */
const _MASK_DFRAC = "\uFFF0DFRAC\uFFF1";
const _MASK_TFRAC = "\uFFF0TFRAC\uFFF1";
const _MASK_CFRAC = "\uFFF0CFRAC\uFFF1";

/**
 * KaTeX inline `\\frac` uses cramped (text-style) numerators/denominators; nested fractions become
 * illegibly small. `\\dfrac` is display-style and stays readable. Only affects render — stored
 * `latex` attrs are unchanged (see `latexForQuizKatexRender`).
 *
 * Preserves `\\dfrac`, `\\tfrac`, and `\\cfrac` (continued fractions).
 */
function promoteInlineFractionsToDisplayStyle(latex: string): string {
  let s = latex;
  s = s.split("\\dfrac").join(_MASK_DFRAC);
  s = s.split("\\tfrac").join(_MASK_TFRAC);
  s = s.split("\\cfrac").join(_MASK_CFRAC);
  s = s.replace(/\\frac/g, "\\dfrac");
  s = s.split(_MASK_DFRAC).join("\\dfrac");
  s = s.split(_MASK_TFRAC).join("\\tfrac");
  s = s.split(_MASK_CFRAC).join("\\cfrac");
  return s;
}

/** Pipeline for `katex.render` in the quiz editor (does not mutate TipTap-stored strings). */
export function latexForQuizKatexRender(latex: string): string {
  return promoteInlineFractionsToDisplayStyle(normalizeMathliveKatexLatex(latex));
}
