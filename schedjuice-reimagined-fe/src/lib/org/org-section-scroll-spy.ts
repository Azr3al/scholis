import type { OrgSectionId } from "@/config/org-record-sections";

import {
  getOrgSectionAnchorElement,
  ORG_SECTION_SCROLL_OFFSET_PX,
} from "./org-section-anchors";

export type OrgScrollDirection = "down" | "up";

/** Pick the active section from scroll position and direction (avoids boundary flicker). */
export function pickActiveOrgSection({
  sectionIds,
  scrollRoot,
  activationOffsetPx = ORG_SECTION_SCROLL_OFFSET_PX,
  scrollDirection = "down",
}: {
  sectionIds: readonly OrgSectionId[];
  scrollRoot: HTMLElement;
  activationOffsetPx?: number;
  scrollDirection?: OrgScrollDirection;
}): OrgSectionId | null {
  if (sectionIds.length === 0) return null;

  const { scrollTop, scrollHeight, clientHeight } = scrollRoot;
  const atBottom = scrollTop + clientHeight >= scrollHeight - 8;
  if (atBottom) {
    return sectionIds[sectionIds.length - 1] ?? null;
  }

  const rootTop =
    scrollRoot.getBoundingClientRect().top + activationOffsetPx;

  if (scrollDirection === "up") {
    for (let i = 0; i < sectionIds.length; i++) {
      const id = sectionIds[i];
      const el = getOrgSectionAnchorElement(id);
      if (!el) continue;
      if (el.getBoundingClientRect().top > rootTop + 1) {
        return sectionIds[Math.max(0, i - 1)] ?? sectionIds[0];
      }
    }
    return sectionIds[sectionIds.length - 1] ?? null;
  }

  let active: OrgSectionId = sectionIds[0];
  for (const id of sectionIds) {
    const el = getOrgSectionAnchorElement(id);
    if (!el) continue;
    if (el.getBoundingClientRect().top <= rootTop + 1) {
      active = id;
    }
  }
  return active;
}
