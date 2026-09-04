import { isValidKey } from './object-key';
import type { Storage, StoredObject } from './storage.types';

/**
 * Files in a Map. For tests.
 *
 * Third adapter behind the same interface, which is the cheapest possible
 * proof that the boundary is real: if a service could only be tested against a
 * filesystem, the abstraction would not be earning anything.
 *
 * Enforces `isValidKey` like the real adapters, so a service that builds a bad
 * key fails in tests rather than only on a disk.
 */
export const createMemoryStorage = (publicUrl = 'http://localhost:3001'): Storage => {
  const objects = new Map<string, StoredObject>();

  return {
    put: ({ key, body, contentType }) => {
      if (!isValidKey(key)) throw new Error('Refusing a malformed object key.');
      objects.set(key, { body, contentType });
      return Promise.resolve();
    },

    get: (key) => Promise.resolve(objects.get(key) ?? null),

    url: (key) => `${publicUrl.replace(/\/$/, '')}/api/files/${key}`,
  };
};
