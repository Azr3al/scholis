import { assignHeadingIds } from "./heading-to-id";

export type MarkdownHeading = { id: string; text: string; level: 1 | 2 | 3 };

export function extractMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const lines = markdown.split("\n");
  const raw: { text: string; level: 1 | 2 | 3 }[] = [];
  for (const line of lines) {
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      raw.push({ text: h3[1].trim(), level: 3 });
      continue;
    }
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      raw.push({ text: h2[1].trim(), level: 2 });
      continue;
    }
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) raw.push({ text: h1[1].trim(), level: 1 });
  }
  const ids = assignHeadingIds(raw.map((r) => r.text));
  return raw.map((r, i) => ({ ...r, id: ids[i] }));
}
