import { axiosClient } from "@/lib/api";

export async function pauseCourse(courseId: number) {
  const res = await axiosClient.post(`courses/${courseId}/pause`, {});
  return res.data;
}

export async function resumeCourse(courseId: number) {
  const res = await axiosClient.post(`courses/${courseId}/resume`, {});
  return res.data;
}

export async function endCourse(courseId: number, reason?: string) {
  const res = await axiosClient.post(`courses/${courseId}/end`, {
    reason: reason ?? "",
  });
  return res.data;
}

export async function reactivateCourse(
  courseId: number,
  payload: { start_date: string; end_date: string },
) {
  const res = await axiosClient.post(`courses/${courseId}/reactivate`, payload);
  return res.data;
}
