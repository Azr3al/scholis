import type { AwardDocument } from "@/lib/image-template/types";
import type { AwardDisplayTemplate } from "@/types/award";

export function awardDocumentFromTemplate(
  template: AwardDisplayTemplate,
): AwardDocument {
  const doc = template.document as AwardDocument;
  if (template.background_url && doc?.background && !doc.background.url) {
    return {
      ...doc,
      background: { ...doc.background, url: template.background_url },
    };
  }
  return doc;
}
