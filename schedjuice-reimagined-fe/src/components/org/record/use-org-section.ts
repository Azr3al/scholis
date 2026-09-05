"use client";

import { useCallback, useEffect } from "react";
import { parseAsString, useQueryState } from "nuqs";
import {
  DEFAULT_ORG_SECTION,
  isOrgSectionId,
  resolveOrgSection,
  type OrgRecordContext,
  type OrgSectionId,
} from "@/config/org-record-sections";

export type OrgAiPane = "settings" | "usage" | "failures" | "requests";

const AI_PANES: OrgAiPane[] = ["settings", "usage", "failures", "requests"];

function isOrgAiPane(value: string): value is OrgAiPane {
  return (AI_PANES as string[]).includes(value);
}

export function useOrgSection(ctx?: OrgRecordContext | null) {
  const [rawSection, setRawSection] = useQueryState(
    "section",
    parseAsString.withDefault(DEFAULT_ORG_SECTION).withOptions({
      history: "replace",
    }),
  );
  const [rawPane, setRawPane] = useQueryState(
    "pane",
    parseAsString.withDefault("settings"),
  );

  const section: OrgSectionId = ctx
    ? resolveOrgSection(rawSection, ctx)
    : isOrgSectionId(rawSection)
      ? rawSection
      : DEFAULT_ORG_SECTION;

  useEffect(() => {
    if (!ctx) return;
    const resolved = resolveOrgSection(rawSection, ctx);
    if (resolved !== rawSection) {
      void setRawSection(resolved);
    }
  }, [rawSection, ctx, setRawSection]);

  const pane: OrgAiPane = isOrgAiPane(rawPane) ? rawPane : "settings";

  const setSection = useCallback(
    (s: OrgSectionId) => {
      void setRawSection(s);
    },
    [setRawSection],
  );

  const setPane = useCallback(
    (p: OrgAiPane) => {
      void setRawPane(p);
    },
    [setRawPane],
  );

  return { section, pane, setSection, setPane };
}
