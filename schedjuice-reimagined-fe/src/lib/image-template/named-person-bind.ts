import type { Layer } from "./types";

export function bindNamedPerson(layer: Layer, userId: number): Layer {
  return { ...layer, type: "named_person", user_id: userId };
}
