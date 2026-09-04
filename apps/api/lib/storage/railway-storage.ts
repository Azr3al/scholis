import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isValidKey } from './object-key';
import type { Storage, StoredObject } from './storage.types';

/**
 * Files on a Railway volume.
 *
 * A volume is a disk attached to one service instance, which is the property
 * that matters: it does not survive being scaled to two replicas, because the
 * second one gets its own empty disk and half the images 404. That is the
 * trade being made for now, and it is the reason this boundary exists — moving
 * to S3 is another file next to this one plus a branch in index.ts.
 *
 * Content types are stored beside the bytes. A filesystem has no metadata, and
 * guessing from the extension on the way out would mean re-deriving something
 * we already knew.
 */
const TYPE_SUFFIX = '.type';

export interface RailwayStorageConfig {
  /** Volume mount path. Railway sets RAILWAY_VOLUME_MOUNT_PATH. */
  root: string;
  /** Public origin of the API, used to build fetchable URLs. */
  publicUrl: string;
}

export const createRailwayStorage = ({ root, publicUrl }: RailwayStorageConfig): Storage => {
  // Resolved once so every path can be checked against it. A key that escapes
  // the root is refused rather than normalised.
  const base = path.resolve(root);

  const pathFor = (key: string): string => {
    if (!isValidKey(key)) throw new Error('Refusing a malformed object key.');

    const full = path.resolve(base, key);
    // Belt and braces: isValidKey already rejects traversal, but this is the
    // line that actually stops a write landing outside the volume, so it stays
    // even though it should be unreachable.
    if (!full.startsWith(base + path.sep)) throw new Error('Refusing a key outside the volume.');
    return full;
  };

  return {
    put: async ({ key, body, contentType }) => {
      const file = pathFor(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
      await writeFile(`${file}${TYPE_SUFFIX}`, contentType, 'utf8');
    },

    get: async (key): Promise<StoredObject | null> => {
      try {
        const file = pathFor(key);
        const [body, contentType] = await Promise.all([
          readFile(file),
          readFile(`${file}${TYPE_SUFFIX}`, 'utf8'),
        ]);
        return { body: new Uint8Array(body), contentType: contentType.trim() };
      } catch {
        // Missing, unreadable, or malformed. All of them mean "no object".
        return null;
      }
    },

    url: (key) => `${publicUrl.replace(/\/$/, '')}/api/files/${key}`,
  };
};
