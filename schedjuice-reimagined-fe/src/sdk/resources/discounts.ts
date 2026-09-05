import type { Discount } from "../_types/discounts";
import {
  defineSearchListResource,
  type SearchListArgs,
} from "../core/define-search-list";

export type ListDiscountsArgs = SearchListArgs;

export const discountsSearch = defineSearchListResource<Discount>({
  path: "discounts",
  keyNamespace: "discounts",
});

export const listDiscounts = discountsSearch.list;
