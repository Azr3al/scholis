const RASTER_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "heic",
  "heif",
]);

/** Uses filename extension only (URLs may omit or distort extensions). */
export function isRasterImageFilename(filename: string): boolean {
  const trimmed = filename.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0 || dot >= trimmed.length - 1) return false;
  const ext = trimmed.slice(dot + 1).toLowerCase();
  return RASTER_IMAGE_EXTENSIONS.has(ext);
}
