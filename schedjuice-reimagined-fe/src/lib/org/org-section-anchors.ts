import type { OrgSectionId } from "@/config/org-record-sections";

/** Stable DOM id for an organization settings section anchor. */
export function orgSectionAnchorId(sectionId: OrgSectionId | string): string {
  return `org-section-${sectionId}`;
}

export function getOrgSectionAnchorElement(
  sectionId: OrgSectionId | string,
): HTMLElement | null {
  return document.getElementById(orgSectionAnchorId(sectionId));
}

/** Offset for sticky panel header + mobile chips (matches scroll-mt-16). */
export const ORG_SECTION_SCROLL_OFFSET_PX = 64;

export function scrollOrgSectionIntoView(
  sectionId: OrgSectionId | string,
  opts?: { behavior?: ScrollBehavior; scrollRoot?: HTMLElement | null },
) {
  const main =
    opts?.scrollRoot ?? document.getElementById("main-content");
  const el = getOrgSectionAnchorElement(sectionId);
  if (!main || !el) return;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const behavior =
    opts?.behavior ?? (reduceMotion ? "auto" : "smooth");

  const mainRect = main.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const targetTop =
    main.scrollTop +
    (elRect.top - mainRect.top) -
    ORG_SECTION_SCROLL_OFFSET_PX;

  main.scrollTo({
    top: Math.max(0, targetTop),
    behavior,
  });
  main.dispatchEvent(new Event("scroll"));
}
