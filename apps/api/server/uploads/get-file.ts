import { isValidKey } from '@/lib/storage';
import type { StoredObject } from '@/lib/storage/storage.types';
import type { PublicContext } from '@/server/context.types';
import { notFound } from '@/server/errors';

/**
 * Serves an uploaded file back.
 *
 * Public on purpose. A student sitting a published test has no account and no
 * session, so an image inside a question has to be fetchable without one.
 * What protects a file is that its key contains a random UUID nobody can
 * guess, not an authorisation check — the same reasoning as the test code
 * itself.
 *
 * That does mean a leaked URL is a readable file. Fine for a diagram in a
 * question; it would not be fine for anything private, which is why this
 * refuses to become a general file service.
 */
export const getFile = async (ctx: PublicContext, key: string): Promise<StoredObject> => {
  // Checked here as well as in the adapters. This is the one path where the key
  // arrives straight from a URL, so it is the one that actually faces traversal.
  if (!isValidKey(key)) throw notFound('File');

  const object = await ctx.storage.get(key);
  if (object === null) throw notFound('File');
  return object;
};
