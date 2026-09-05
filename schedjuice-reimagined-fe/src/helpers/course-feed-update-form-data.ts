export type CourseFeedUpdatePayload = {
  post_type: "announcement" | "daily_lesson";
  title?: string | null;
  finished_unit?: number | null;
  html_data: string;
  data?: string;
  course: number;
  send_to_microsoft?: boolean;
  microsoft_channel_id?: string | null;
  newFiles?: File[];
  deletedAttachmentIds?: number[];
};

export function buildCourseFeedUpdateFormData(
  payload: CourseFeedUpdatePayload,
): FormData {
  const fd = new FormData();
  fd.append("post_type", payload.post_type);
  fd.append("course", String(payload.course));
  fd.append("html_data", payload.html_data);
  fd.append("data", payload.data ?? payload.html_data);
  if (payload.post_type === "announcement" && payload.title) {
    fd.append("title", payload.title);
  }
  if (payload.post_type === "daily_lesson") {
    fd.append(
      "finished_unit",
      payload.finished_unit != null ? String(payload.finished_unit) : "",
    );
  }
  if (payload.send_to_microsoft != null) {
    fd.append("send_to_microsoft", payload.send_to_microsoft ? "true" : "false");
  }
  if (payload.microsoft_channel_id) {
    fd.append("microsoft_channel_id", payload.microsoft_channel_id);
  }
  payload.newFiles?.forEach((f) => fd.append("files", f));
  if (payload.deletedAttachmentIds?.length) {
    fd.append(
      "deleted_attachment_ids",
      JSON.stringify(payload.deletedAttachmentIds),
    );
  }
  return fd;
}
