import { canEditUser } from "@/helpers/authorization";
import { isStaffSubject } from "@/lib/points/visibility";
import type { RecordSectionContext } from "./record-sections";

export type RecordRailLink = {
  /** Subpath under `/users/[id]/…` used to detect the active item. */
  pathSuffix: string;
  label: (ctx: RecordSectionContext) => string;
  visible: (ctx: RecordSectionContext) => boolean;
};

export const RECORD_RAIL_LINKS: RecordRailLink[] = [
  {
    pathSuffix: "teaching-subjects",
    label: ({ subject, viewer }) =>
      viewer.id === subject.id ? "My Subjects" : "Teaching subjects",
    visible: ({ subject, viewer }) =>
      isStaffSubject(subject) &&
      (viewer.id === subject.id || canEditUser(viewer, subject.id)),
  },
];

export function visibleRecordRailLinks(
  ctx: RecordSectionContext,
): RecordRailLink[] {
  return RECORD_RAIL_LINKS.filter((link) => link.visible(ctx));
}
