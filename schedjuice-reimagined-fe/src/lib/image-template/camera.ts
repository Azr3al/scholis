export type Camera = { x: number; y: number; zoom: number };

export function clampZoom(zoom: number): number {
  return Math.min(4, Math.max(0.25, zoom));
}

export function screenToDocument(
  camera: Camera,
  point: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: (point.x - camera.x) / camera.zoom,
    y: (point.y - camera.y) / camera.zoom,
  };
}

export function documentToScreen(
  camera: Camera,
  point: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: point.x * camera.zoom + camera.x,
    y: point.y * camera.zoom + camera.y,
  };
}
