/**
 * Which storage adapter to build, decided from configuration alone.
 *
 * Split from index.ts exactly as the mail provider is: the rule is one readable
 * function, testable without touching a disk.
 *
 * Unlike mail there is no unsafe default to guard against — a missing volume
 * fails loudly on first write rather than silently doing the wrong thing — so
 * this stays a plain lookup. It exists so that adding 's3' later is a case in
 * one switch, not a search for every place that assumed a filesystem.
 */
export type StorageProvider = 'railway';

const PROVIDERS: readonly string[] = ['railway'];

export interface StorageEnv {
  STORAGE_PROVIDER?: string | undefined;
}

export const resolveStorageProvider = (env: StorageEnv): StorageProvider => {
  const configured = env.STORAGE_PROVIDER?.trim();
  if (configured === undefined || configured === '') return 'railway';

  if (!PROVIDERS.includes(configured)) {
    throw new Error(
      `Unknown STORAGE_PROVIDER "${configured}". Expected one of: ${PROVIDERS.join(', ')}`,
    );
  }
  return configured as StorageProvider;
};
