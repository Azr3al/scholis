import type { EmailTemplate } from "../_types/email-templates";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListEmailTemplatesArgs = SearchListArgs;

export const emailTemplatesSearch = defineSearchListResource<EmailTemplate>({
  path: "email-templates",
  keyNamespace: "email-templates",
});

export const listEmailTemplates = emailTemplatesSearch.list;
