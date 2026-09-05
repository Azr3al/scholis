"use client";

import type { ResourceListResult } from "@/components/data-table/types";

import type { EmailTemplate } from "../_types/email-templates";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import { emailTemplatesSearch } from "../resources/email-templates";

export type UseEmailTemplatesListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useEmailTemplatesList(
  args: UseEmailTemplatesListArgs,
): ResourceListResult<EmailTemplate> {
  return useSearchListQuery(emailTemplatesSearch, args);
}
