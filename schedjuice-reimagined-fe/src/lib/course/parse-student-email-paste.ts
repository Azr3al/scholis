export function parseStudentEmailPaste(text: string): string[] {
  const tokens = text
    .split(/\r?\n/)
    .flatMap((line) => line.split("\t"))
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(token);
  }
  return result;
}
