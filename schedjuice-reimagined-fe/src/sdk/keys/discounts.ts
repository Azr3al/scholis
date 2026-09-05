import type { SearchListArgs } from "../core/define-search-list";
import { discountsSearch } from "../resources/discounts";

export type DiscountsListKeyArgs = SearchListArgs;

export const discountsKeys = discountsSearch.keys;
