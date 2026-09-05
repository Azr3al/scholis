import { makePostRequest } from "@/app/client-api/utils";

export type CourseFeedInlineImageUpload = {
  id: number;
  url: string;
  filename: string;
  byteSize: number;
};

export async function uploadCourseFeedInlineImage(
  courseId: number,
  file: File,
): Promise<CourseFeedInlineImageUpload> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await makePostRequest(
    `courses/${courseId}/announcement-attachments`,
    formData,
    {},
    {},
  );
  const row = res.data?.data as {
    id?: number;
    url?: string;
    filename?: string;
    byte_size?: number;
  };
  if (row?.id == null || !row.url) {
    throw new Error("Upload response missing attachment id");
  }
  return {
    id: row.id,
    url: row.url,
    filename: row.filename ?? file.name,
    byteSize: row.byte_size ?? file.size,
  };
}
