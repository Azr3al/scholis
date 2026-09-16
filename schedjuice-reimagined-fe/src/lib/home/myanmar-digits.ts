const MYANMAR_DIGITS = "၀၁၂၃၄၅၆၇၈၉";

export function formatMyanmarDigits(value: number | string): string {
  return String(value).replace(/\d/g, (d) => MYANMAR_DIGITS[Number(d)] ?? d);
}
