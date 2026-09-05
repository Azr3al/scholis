import * as emoji from "node-emoji";

/** Converts Discord-style :shortcode: to emoji (e.g. :sob: → 😢) */
export const emojify = (text: string): string => emoji.emojify(text);
