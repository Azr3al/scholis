import type { SearchListArgs } from "../core/define-search-list";
import { emailTemplatesSearch } from "../resources/email-templates";

export type EmailTemplatesListKeyArgs = SearchListArgs;

export const emailTemplatesKeys = emailTemplatesSearch.keys;
