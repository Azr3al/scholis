import { randomUUID } from 'node:crypto';

/**
 * Object keys, and the rules that keep them safe to put on a filesystem.
 *
 * Pure and separate from any adapter so the rules can be tested without a disk
 * or a bucket, and so both adapters are forced through the same validation.
 *
 * The Railway adapter turns a key into a path, which makes this a path
 * traversal surface: a key of `../../etc/passwd` would escape the volume, and
 * a key read back out of a question body is attacker-influenced. So keys are
 * generated here in one fixed shape and validated on the way back in, rather
 * than sanitised — a whitelist that rejects is safer than an escaper that
 * tries to fix.
 */

/** `<orgId>/<uuid>.<ext>` — nothing else is a key. */
const KEY_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'weba',
};

export const ALLOWED_CONTENT_TYPES = Object.keys(EXTENSIONS);

/**
 * SVG is deliberately absent from what teachers may upload.
 *
 * It is an image to a teacher and a script host to a browser: an inline
 * `<script>` in an SVG served from our own origin would run with our cookies.
 * Serving it as an attachment would be safe, but an attachment is useless as an
 * inline question image, so it is simply not accepted.
 */
export const UPLOADABLE_CONTENT_TYPES = ALLOWED_CONTENT_TYPES.filter(
  (type) => type !== 'image/svg+xml',
);

export const extensionFor = (contentType: string): string | null => EXTENSIONS[contentType] ?? null;

export const isValidKey = (key: string): boolean => KEY_PATTERN.test(key);

/** A fresh key for an org. Callers never choose the filename. */
export const newObjectKey = (orgId: string, contentType: string): string | null => {
  const extension = extensionFor(contentType);
  if (extension === null) return null;
  return `${orgId}/${randomUUID()}.${extension}`;
};
