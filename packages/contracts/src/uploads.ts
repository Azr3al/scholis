import { z } from 'zod';

/**
 * What comes back after a teacher uploads a file.
 *
 * The key is returned alongside the URL on purpose. The URL is where a browser
 * fetches the file today and depends on the provider; the key is what actually
 * identifies the object and does not. Storing the key in a question body means
 * moving from a Railway volume to S3 changes how URLs are built, not what the
 * questions say.
 */
export const uploadedFileSchema = z.object({
  key: z.string().min(1),
  url: z.string().min(1),
  contentType: z.string().min(1),
  bytes: z.number().int().positive(),
});

export type UploadedFile = z.infer<typeof uploadedFileSchema>;
