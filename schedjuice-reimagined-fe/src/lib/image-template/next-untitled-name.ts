export function nextUntitledName(names: string[]): string {
  const used = new Set(names.map((name) => name.trim().toLowerCase()));
  if (!used.has("untitled")) return "Untitled";
  let n = 2;
  while (used.has(`untitled ${n}`)) n += 1;
  return `Untitled ${n}`;
}
