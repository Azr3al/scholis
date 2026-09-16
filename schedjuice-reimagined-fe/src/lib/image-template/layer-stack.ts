import type { Layer } from "./types";

export function removeLayer(layers: Layer[], id: string): Layer[] {
  const next = layers.filter((layer) => layer.id !== id);
  return next.length === layers.length ? layers : next;
}

export function stackOrder(layers: Layer[]): Layer[] {
  return layers
    .map((layer, index) => ({ layer, index }))
    .sort((a, b) => a.layer.z - b.layer.z || a.index - b.index)
    .map(({ layer }) => layer);
}

function withStackIndex(ordered: Layer[]): Layer[] {
  return ordered.map((layer, z) => ({ ...layer, z }));
}

export function raiseLayer(layers: Layer[], id: string): Layer[] {
  const target = layers.find((layer) => layer.id === id);
  if (!target) return layers;
  const maxZ = layers.reduce((max, layer) => Math.max(max, layer.z), target.z);
  const last = layers[layers.length - 1];
  const aloneAtTop =
    last?.id === id &&
    target.z === maxZ &&
    layers.every((layer) => layer.id === id || layer.z < maxZ);
  if (aloneAtTop) return layers;
  return [...layers.filter((layer) => layer.id !== id), { ...target, z: maxZ + 1 }];
}

export function bringToFront(layers: Layer[], id: string): Layer[] {
  return raiseLayer(layers, id);
}

export function sendToBack(layers: Layer[], id: string): Layer[] {
  const target = layers.find((layer) => layer.id === id);
  if (!target) return layers;
  const minZ = layers.reduce((min, layer) => Math.min(min, layer.z), target.z);
  const first = layers[0];
  const aloneAtBack =
    first?.id === id &&
    target.z === minZ &&
    layers.every((layer) => layer.id === id || layer.z > minZ);
  if (aloneAtBack) return layers;
  return [{ ...target, z: minZ - 1 }, ...layers.filter((layer) => layer.id !== id)];
}

export function bringForward(layers: Layer[], id: string): Layer[] {
  const ordered = stackOrder(layers);
  const index = ordered.findIndex((layer) => layer.id === id);
  if (index < 0 || index >= ordered.length - 1) return layers;
  const next = [...ordered];
  const current = next[index];
  const above = next[index + 1];
  if (!current || !above) return layers;
  next[index] = above;
  next[index + 1] = current;
  return withStackIndex(next);
}

export function sendBackward(layers: Layer[], id: string): Layer[] {
  const ordered = stackOrder(layers);
  const index = ordered.findIndex((layer) => layer.id === id);
  if (index <= 0) return layers;
  const next = [...ordered];
  const current = next[index];
  const below = next[index - 1];
  if (!current || !below) return layers;
  next[index] = below;
  next[index - 1] = current;
  return withStackIndex(next);
}

export function layerStackIndex(layers: Layer[], id: string): number {
  return stackOrder(layers).findIndex((layer) => layer.id === id);
}

export function isEditorTypingTarget(event: { target: EventTarget | null }): boolean {
  const node = event.target as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(node.isContentEditable);
}

export function isDeleteLayerKey(event: { key: string }): boolean {
  return event.key === "Backspace" || event.key === "Delete";
}
