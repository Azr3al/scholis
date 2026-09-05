import { deleteEntity, makePostRequest } from "@/app/client-api/utils";
import { uploadToJuiceBoxMultipart } from "@/lib/juicebox/upload";
import type { WikiItem } from "@/types/wiki-item";

export class WikiItemRollbackFailedError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("Upload failed and rollback delete also failed");
    this.name = "WikiItemRollbackFailedError";
    this.cause = cause;
  }
}

export async function createFileItemWithUpload({
  name,
  courseId,
  parentId = null,
  files,
}: {
  name: string;
  courseId: string;
  parentId?: number | null;
  files: File[];
}): Promise<WikiItem> {
  const response = await makePostRequest("items", {
    name,
    course: Number(courseId),
    parent: parentId,
    item_type: "file",
    is_folder: false,
  });
  const item = response.data.data as WikiItem;

  try {
    await uploadToJuiceBoxMultipart({
      files,
      tableName: "app_wiki_item",
      foreignKey: String(item.id),
      isPublic: false,
      purge: false,
    });
  } catch (uploadError) {
    try {
      await deleteEntity("items", item.id);
    } catch {
      throw new WikiItemRollbackFailedError(uploadError);
    }
    throw uploadError;
  }

  return item;
}
