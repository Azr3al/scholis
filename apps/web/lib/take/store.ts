import type { TestPackage } from '@scholis/schema';
import { openDB, type IDBPDatabase } from 'idb';
import { makeCachedPackage, readCachedPackage, type CachedPackage } from './package-cache';
import { isStale, readSnapshot, type Snapshot } from './snapshot';

// IndexedDB rather than sessionStorage for the answers: it survives a reload,
// it's async so a big essay doesn't block the keystroke that triggered it, and
// it isn't capped at a few megabytes.
const DB_NAME = 'scholis';
const STORE = 'attempts';

// Separate store, not a field on the snapshot. A package belongs to a test code
// and outlives any one attempt; a snapshot belongs to an attempt and is deleted
// the moment it is handed in. Merging them would mean losing the questions at
// exactly the point another attempt on the same code might want them.
const PACKAGES = 'packages';

let dbPromise: Promise<IDBPDatabase> | null = null;

const db = async (): Promise<IDBPDatabase> => {
  // Version 2 adds `packages`. The upgrade is additive and guarded, so a device
  // holding a v1 database keeps its in-flight answers through the migration.
  dbPromise ??= openDB(DB_NAME, 2, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: 'attemptId' });
      }
      if (!database.objectStoreNames.contains(PACKAGES)) {
        database.createObjectStore(PACKAGES, { keyPath: 'code' });
      }
    },
  });
  return dbPromise;
};

/**
 * Keep the paper for this code, so a reload without a connection can show it.
 *
 * Only ever called with a package that just came back from the server, so what
 * lands here is whatever the API served — already key-stripped by
 * `publicQuestionSchema` before it left.
 */
export const saveTestPackage = async (code: string, pkg: TestPackage): Promise<void> => {
  try {
    await (await db()).put(PACKAGES, makeCachedPackage(code, pkg, new Date()));
  } catch {
    // Private browsing, quota, a blocked upgrade. Costs the offline reload,
    // never the attempt.
  }
};

export const loadTestPackage = async (code: string): Promise<CachedPackage | null> => {
  try {
    return readCachedPackage(await (await db()).get(PACKAGES, code), code);
  } catch {
    return null;
  }
};

export const saveSnapshot = async (snapshot: Snapshot): Promise<void> => {
  try {
    await (await db()).put(STORE, snapshot);
  } catch {
    // Private browsing, quota, or a blocked upgrade. Losing durability is bad
    // but not worth throwing away the answer the student just typed.
  }
};

export const loadSnapshot = async (attemptId: string): Promise<Snapshot | null> => {
  try {
    return readSnapshot(await (await db()).get(STORE, attemptId), attemptId);
  } catch {
    return null;
  }
};

export const clearSnapshot = async (attemptId: string): Promise<void> => {
  try {
    await (await db()).delete(STORE, attemptId);
  } catch {
    // ignore
  }
};

/**
 * Drop snapshots nothing can reach any more.
 *
 * Handing in clears its own snapshot; abandoning doesn't. Close the tab and
 * sessionStorage loses the handle, leaving the answers in IndexedDB with
 * nothing able to open them again — on a shared school machine that's one
 * student's work left for the next one.
 *
 * Best effort: if it fails, the sweep just happens next time.
 */
export const pruneStaleSnapshots = async (now = new Date()): Promise<void> => {
  try {
    const database = await db();
    const stored: unknown[] = await database.getAll(STORE);

    const dead = stored.filter((s): s is Snapshot => {
      const row = s as Partial<Snapshot> | null;
      return typeof row?.attemptId === 'string' && isStale(String(row.savedAt), now);
    });

    await Promise.all(dead.map((s) => database.delete(STORE, s.attemptId)));
  } catch {
    // ignore
  }
};
