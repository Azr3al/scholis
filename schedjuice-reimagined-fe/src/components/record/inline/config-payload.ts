/** Build an updateEntity diff for the given RHF paths, nesting custom_data.* keys. */
export function buildGroupPayload(
  values: Record<string, unknown>,
  paths: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  for (const p of paths) {
    if (p.startsWith("custom_data.")) {
      custom[p.slice("custom_data.".length)] = values[p];
    } else {
      out[p] = values[p];
    }
  }
  if (Object.keys(custom).length > 0) out.custom_data = custom;
  return out;
}
