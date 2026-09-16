export const CANVAS_FONT_ALLOWLIST = [
  { label: "Noto Sans", family: "Noto Sans" },
  { label: "Fraunces", family: "Fraunces" },
  { label: "Adobe Caslon Pro", family: "Adobe Caslon Pro" },
  { label: "Poppins", family: "Poppins" },
  { label: "Montserrat", family: "Montserrat" },
  { label: "Roboto", family: "Roboto" },
  { label: "Playfair Display", family: "Playfair Display" },
  { label: "Lora", family: "Lora" },
  { label: "Arial", family: "Arial" },
  { label: "Helvetica", family: "Helvetica" },
  { label: "Verdana", family: "Verdana" },
  { label: "Tahoma", family: "Tahoma" },
  { label: "Trebuchet MS", family: "Trebuchet MS" },
  { label: "Georgia", family: "Georgia" },
  { label: "Times New Roman", family: "Times New Roman" },
  { label: "Palatino", family: "Palatino" },
  { label: "Garamond", family: "Garamond" },
  { label: "Courier New", family: "Courier New" },
  { label: "Impact", family: "Impact" },
] as const;

const ALLOWED = new Set<string>([
  ...CANVAS_FONT_ALLOWLIST.map((f) => f.family),
  "Arial",
]);

export function canvasFontFamily(stored?: string): string {
  if (stored && ALLOWED.has(stored)) return stored;
  return "Noto Sans";
}
