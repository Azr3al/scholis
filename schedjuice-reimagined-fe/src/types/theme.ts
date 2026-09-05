import * as z from "zod";

export const colorSchema = z.object({
  r: z.number(),
  g: z.number(),
  b: z.number(),
});

export const themeSchema = z.object({
  background: colorSchema,
  cardBackground: colorSchema,
  mutedBackground: colorSchema,
  popoverBackground: colorSchema,
  text: colorSchema,
  cardText: colorSchema,
  mutedText: colorSchema,
  popoverText: colorSchema,
  border: colorSchema,
  primary: colorSchema,
  primaryText: colorSchema,
  secondary: colorSchema,
  secondaryText: colorSchema,
});
