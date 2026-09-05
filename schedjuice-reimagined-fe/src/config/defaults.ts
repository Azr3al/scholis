import { queryParamOptions } from "@/types/api";
import { colorSchema, themeSchema } from "@/types/theme";
import * as z from "zod";

const DEFAULT_FIRST_PAGE_INDEX = 0;
export const DEFAULT_PAGE_SIZE = 10;
const queryParamDefault: queryParamOptions = {
  page: DEFAULT_FIRST_PAGE_INDEX + 1,
  size: DEFAULT_PAGE_SIZE,
  sorts: ["id"],
  csv: false,
  group_by: "all",
  range_group_by: "day",
};

export const BLACK_TEXT: z.infer<typeof colorSchema> = {
  r: 2,
  g: 8,
  b: 23,
};
const MUTED_BLACK_TEXT: z.infer<typeof colorSchema> = {
  r: 100,
  g: 116,
  b: 139,
};
export const WHITE_TEXT: z.infer<typeof colorSchema> = {
  r: 252,
  g: 253,
  b: 253,
};
export const DEFAULT_THEME: z.infer<typeof themeSchema> = {
  background: {
    r: 240,
    g: 248,
    b: 255,
  },
  text: BLACK_TEXT,
  cardBackground: {
    r: 184,
    g: 217,
    b: 237,
  },
  cardText: BLACK_TEXT,
  mutedBackground: {
    r: 189,
    g: 215,
    b: 204,
  },
  mutedText: MUTED_BLACK_TEXT,
  popoverBackground: {
    r: 240,
    g: 248,
    b: 255,
  },
  popoverText: BLACK_TEXT,
  border: {
    r: 92,
    g: 123,
    b: 146,
  },
  primary: {
    r: 19,
    g: 113,
    b: 180,
  },
  primaryText: WHITE_TEXT,
  secondary: {
    r: 141,
    g: 161,
    b: 177,
  },
  secondaryText: BLACK_TEXT,
};

export { queryParamDefault };
