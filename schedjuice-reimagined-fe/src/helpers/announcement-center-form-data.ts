import {
  AnnouncementCenterScope,
  type AnnouncementCourseFilters,
} from "@/types/announcement-center";

export type BuildAnnouncementCenterFormDataArgs = {
  scope: AnnouncementCenterScope;
  title: string;
  dataHtml: string;
  createdById: number | undefined;
  files: File[];
  courseIds?: number[];
  sendToMicrosoft?: boolean;
  courseFilters?: AnnouncementCourseFilters;
};

export function buildAnnouncementCenterFormData({
  scope,
  title,
  dataHtml,
  createdById,
  files,
  courseIds,
  sendToMicrosoft,
  courseFilters,
}: BuildAnnouncementCenterFormDataArgs): FormData {
  const formData = new FormData();
  formData.append("title", title);
  formData.append("data", dataHtml);
  formData.append("post_type", "announcement");
  if (createdById != null) {
    formData.append("created_by", String(createdById));
  }
  if (
    scope === AnnouncementCenterScope.PerCourse &&
    courseIds != null &&
    courseIds.length > 0
  ) {
    formData.append("course_ids", JSON.stringify(courseIds));
  }
  if (sendToMicrosoft) {
    formData.append("send_to_microsoft", "true");
  }
  if (courseFilters) {
    formData.append("course_filters", JSON.stringify(courseFilters));
  }
  files.forEach((file) => formData.append("files", file));
  return formData;
}
