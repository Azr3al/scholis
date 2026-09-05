export function cardFileName(
  name: string,
  ext: "png" | "pdf",
  side?: "front" | "back",
): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = side === "back" ? "-back" : "";
  if (!slug) return `id-card${suffix}.${ext}`;
  return `id-card-${slug}${suffix}.${ext}`;
}
