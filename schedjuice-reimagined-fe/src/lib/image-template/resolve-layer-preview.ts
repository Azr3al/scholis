import type { AwardPreviewBinder } from "./preview-binder";
import type { Layer } from "./types";
import {
  interpolateVariableTemplate,
  tokensFromBinder,
  variableTemplate,
} from "./variable-template";

export type LayerPreview =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string | null; placeholder: boolean };

export function resolveLayerPreview(
  layer: Layer,
  binder: AwardPreviewBinder,
): LayerPreview {
  if (layer.type === "text") {
    return {
      kind: "text",
      text: interpolateVariableTemplate(layer.text, tokensFromBinder(binder)),
    };
  }
  if (layer.type === "field") {
    const tokens = tokensFromBinder(binder);
    return {
      kind: "text",
      text: interpolateVariableTemplate(variableTemplate(layer), tokens),
    };
  }
  if (layer.type === "photo") {
    return {
      kind: "image",
      url: binder.awardImageUrl,
      placeholder: !binder.awardImageUrl,
    };
  }
  if (layer.type === "signature") {
    if (layer.bind.kind === "mt") {
      return {
        kind: "image",
        url: binder.mtSignatureUrl,
        placeholder: !binder.mtSignatureUrl,
      };
    }
    const user = binder.namedUsers[layer.bind.user_id];
    return {
      kind: "image",
      url: user?.signatureUrl ?? null,
      placeholder: !user?.signatureUrl,
    };
  }
  if (layer.type === "named_person") {
    const user = binder.namedUsers[layer.user_id];
    const name = user?.name?.trim() ? user.name : "User unavailable";
    return {
      kind: "text",
      text: interpolateVariableTemplate(
        variableTemplate(layer),
        tokensFromBinder(binder, name),
      ),
    };
  }
  return { kind: "text", text: "QR" };
}
