const ROLE_STRING_PREFIX = "sj1.";

type RoleStringPayload = {
  label: string;
  slug: string;
  codes: string[];
};

type EncodedRoleString = {
  v: 1;
  n: string;
  s: string;
  c: string[];
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(encoded: string): Uint8Array {
  let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  if (pad) {
    base64 += "=".repeat(4 - pad);
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toBase64Url(value: unknown): string {
  const json = JSON.stringify(value);
  return bytesToBase64Url(new TextEncoder().encode(json));
}

function fromBase64Url<T>(encoded: string): T {
  const json = new TextDecoder().decode(base64UrlToBytes(encoded));
  return JSON.parse(json) as T;
}

function normalizePayload(payload: RoleStringPayload): RoleStringPayload {
  return {
    label: payload.label.trim(),
    slug: payload.slug.trim(),
    codes: Array.from(
      new Set(payload.codes.map((code) => code.trim()).filter(Boolean)),
    ).sort(),
  };
}

function assertEncodedPayload(value: EncodedRoleString): RoleStringPayload {
  if (value.v !== 1) {
    throw new Error("Unsupported role string version");
  }
  if (typeof value.n !== "string" || !value.n.trim()) {
    throw new Error("Role string is missing a label");
  }
  if (typeof value.s !== "string" || !value.s.trim()) {
    throw new Error("Role string is missing a slug");
  }
  if (!Array.isArray(value.c) || !value.c.every((code) => typeof code === "string")) {
    throw new Error("Role string has invalid permission codes");
  }

  return normalizePayload({
    label: value.n,
    slug: value.s,
    codes: value.c,
  });
}

export function encodeRoleString(payload: RoleStringPayload): string {
  const normalized = normalizePayload(payload);
  const encoded = toBase64Url({
    v: 1,
    n: normalized.label,
    s: normalized.slug,
    c: normalized.codes,
  } satisfies EncodedRoleString);

  return `${ROLE_STRING_PREFIX}${encoded}`;
}

export function decodeRoleString(value: string): RoleStringPayload {
  const trimmed = value.trim();
  if (!trimmed.startsWith(ROLE_STRING_PREFIX)) {
    throw new Error("Invalid role string prefix");
  }

  const encoded = trimmed.slice(ROLE_STRING_PREFIX.length);
  if (!encoded) {
    throw new Error("Role string payload is empty");
  }

  return assertEncodedPayload(fromBase64Url<EncodedRoleString>(encoded));
}
