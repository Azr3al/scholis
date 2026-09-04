import { newObjectKey, UPLOADABLE_CONTENT_TYPES } from '@/lib/storage';
import type { AuthedContext } from '@/server/context.types';
import { validationFailed } from '@/server/errors';
import { uploadedFileSchema, type UploadedFile } from '@scholis/contracts';

/**
 * Accepts a file from a signed-in teacher and hands back a URL to embed.
 *
 * Deliberately not a general file service. It exists so a question body can
 * reference an image or an audio clip, so it takes bytes and a declared type
 * and returns a key — no listing, no deleting, no browsing. Every one of those
 * would need an ownership model that questions do not have yet.
 */

/** 10 MB. Comfortably a diagram or a minute of speech, nowhere near a video. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface UploadFileInput {
  contentType: string;
  body: Uint8Array;
}

export const uploadFile = async (
  ctx: AuthedContext,
  input: UploadFileInput,
): Promise<UploadedFile> => {
  // The browser's declared type, not sniffed content. Worth being plain about:
  // this stops a teacher uploading a .exe by accident, not a determined person
  // mislabelling one. What makes that safe is the serving route, which sends
  // back the stored type with nosniff and never text/html.
  const contentType = input.contentType.split(';')[0]?.trim().toLowerCase() ?? '';

  if (!UPLOADABLE_CONTENT_TYPES.includes(contentType)) {
    throw validationFailed(
      `That file type isn't supported. Try one of: ${UPLOADABLE_CONTENT_TYPES.join(', ')}.`,
    );
  }

  if (input.body.byteLength === 0) throw validationFailed('That file is empty.');
  if (input.body.byteLength > MAX_UPLOAD_BYTES) {
    throw validationFailed(
      `That file is larger than ${String(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
    );
  }

  // Keyed by organisation, and the caller never picks the name. Two schools
  // cannot collide, and a guessed key from one org is not a key in another.
  const key = newObjectKey(ctx.actor.orgId, contentType);
  if (key === null) throw validationFailed('That file type isn’t supported.');

  await ctx.storage.put({ key, body: input.body, contentType });

  return uploadedFileSchema.parse({
    key,
    url: ctx.storage.url(key),
    contentType,
    bytes: input.body.byteLength,
  });
};
