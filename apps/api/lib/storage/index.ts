import { resolveStorageProvider } from './provider';
import { createRailwayStorage } from './railway-storage';
import type { Storage } from './storage.types';

export {
  ALLOWED_CONTENT_TYPES,
  extensionFor,
  isValidKey,
  newObjectKey,
  UPLOADABLE_CONTENT_TYPES,
} from './object-key';
export { resolveStorageProvider, type StorageProvider } from './provider';
export type { Storage, StoragePutInput, StoredObject } from './storage.types';

let cached: Storage | null = null;

/**
 * The one place a storage provider is chosen.
 *
 * Adding S3 is one adapter file and one case here — callers keep getting a
 * `Storage` and stay unaware of which. Cached because an adapter is a handle,
 * not a connection, and rebuilding it per request would re-read the
 * environment for no reason.
 */
export const getStorage = (): Storage => {
  if (cached !== null) return cached;

  // Called for its validation: an unknown STORAGE_PROVIDER throws here rather
  // than being quietly ignored. There is one provider today, so there is
  // nothing to branch on yet — writing a switch over a one-member union would
  // be a decision that hasn't been made. When S3 arrives this becomes a switch
  // and callers still only ever see `Storage`.
  resolveStorageProvider(process.env);

  cached = createRailwayStorage({
    // Railway sets RAILWAY_VOLUME_MOUNT_PATH when a volume is attached. Local
    // development falls back to a directory beside the repo, which is
    // gitignored — the same code path either way, so uploads are exercised in
    // development rather than only discovered in production.
    root: process.env.RAILWAY_VOLUME_MOUNT_PATH ?? '.storage',
    // Same default as lib/auth's baseURL, and for the same reason: local
    // development shouldn't need a variable set to serve a file.
    publicUrl: process.env.AUTH_URL ?? 'http://localhost:3001',
  });
  return cached;
};
