import { createMemoryStorage } from '@/lib/storage/memory-storage';
import { isValidKey, newObjectKey } from '@/lib/storage/object-key';
import type { AuthedContext, PublicContext } from '@/server/context.types';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getFile } from './get-file';
import { MAX_UPLOAD_BYTES, uploadFile } from './upload-file';

const ORG = randomUUID();
const OTHER_ORG = randomUUID();

// No database needed: uploads never touch one. The storage adapter is the
// in-memory one, which is the point of the interface.
const contexts = () => {
  const storage = createMemoryStorage();
  const authed = {
    storage,
    actor: { userId: randomUUID(), orgId: ORG, role: 'owner' as const },
  } as unknown as AuthedContext;
  const publicCtx = { storage } as unknown as PublicContext;
  return { authed, publicCtx };
};

const png = (bytes = 8) => new Uint8Array(bytes).fill(1);

describe('uploadFile', () => {
  it('stores a file and returns a key that resolves', async () => {
    const { authed, publicCtx } = contexts();

    const result = await uploadFile(authed, { contentType: 'image/png', body: png() });

    expect(result.key.startsWith(`${ORG}/`)).toBe(true);
    expect(result.contentType).toBe('image/png');
    expect(result.bytes).toBe(8);

    const stored = await getFile(publicCtx, result.key);
    expect(stored.contentType).toBe('image/png');
    expect(stored.body).toHaveLength(8);
  });

  it('tolerates a charset on the declared type', async () => {
    const { authed } = contexts();
    const result = await uploadFile(authed, {
      contentType: 'image/png; charset=binary',
      body: png(),
    });
    expect(result.contentType).toBe('image/png');
  });

  it('refuses a type nobody asked for', async () => {
    const { authed } = contexts();
    await expect(
      uploadFile(authed, { contentType: 'application/x-msdownload', body: png() }),
    ).rejects.toThrow(/isn't supported/i);
  });

  it('refuses SVG, which is a script host wearing an image costume', async () => {
    // Served from our own origin it would run with our cookies. An attachment
    // would be safe and useless, so it is simply not accepted.
    const { authed } = contexts();
    await expect(uploadFile(authed, { contentType: 'image/svg+xml', body: png() })).rejects.toThrow(
      /isn't supported/i,
    );
  });

  it('refuses an empty file', async () => {
    const { authed } = contexts();
    await expect(
      uploadFile(authed, { contentType: 'image/png', body: new Uint8Array(0) }),
    ).rejects.toThrow(/empty/i);
  });

  it('refuses a file over the limit', async () => {
    const { authed } = contexts();
    await expect(
      uploadFile(authed, { contentType: 'image/png', body: png(MAX_UPLOAD_BYTES + 1) }),
    ).rejects.toThrow(/larger than/i);
  });

  it('never reuses a key', async () => {
    const { authed } = contexts();
    const a = await uploadFile(authed, { contentType: 'image/png', body: png() });
    const b = await uploadFile(authed, { contentType: 'image/png', body: png() });
    expect(a.key).not.toBe(b.key);
  });

  it('scopes keys to the uploading organisation', async () => {
    const { authed } = contexts();
    const result = await uploadFile(authed, { contentType: 'audio/mpeg', body: png() });
    expect(result.key.startsWith(`${ORG}/`)).toBe(true);
    expect(result.key.startsWith(`${OTHER_ORG}/`)).toBe(false);
    expect(result.key.endsWith('.mp3')).toBe(true);
  });
});

/**
 * The serving route takes a key straight from a URL, so this is where path
 * traversal actually faces the disk.
 */
describe('getFile', () => {
  it('refuses anything that is not a well-formed key', async () => {
    const { publicCtx } = contexts();

    for (const key of [
      '../../etc/passwd',
      `${ORG}/../../../etc/passwd`,
      `${ORG}/..%2f..%2fpasswd.png`,
      'not-a-uuid/file.png',
      `${ORG}/file.png`,
      `${ORG}/${randomUUID()}`,
      `${ORG}/${randomUUID()}.exe`,
      '',
    ]) {
      await expect(getFile(publicCtx, key)).rejects.toThrow(/not found/i);
    }
  });

  it('reports a missing object as not found rather than throwing', async () => {
    const { publicCtx } = contexts();
    await expect(getFile(publicCtx, `${ORG}/${randomUUID()}.png`)).rejects.toThrow(/not found/i);
  });
});

describe('object keys', () => {
  it('accepts only the shape the adapters can safely turn into a path', () => {
    const key = newObjectKey(ORG, 'image/png');
    expect(key).not.toBeNull();
    expect(isValidKey(key ?? '')).toBe(true);

    expect(isValidKey(`${ORG}/../escape.png`)).toBe(false);
    expect(isValidKey(`${ORG}/sub/dir.png`)).toBe(false);
    expect(isValidKey(`/etc/passwd`)).toBe(false);
  });

  it('has no key for a type it cannot name', () => {
    expect(newObjectKey(ORG, 'application/zip')).toBeNull();
  });
});
