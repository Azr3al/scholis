import { axiosClient } from "@/lib/api";
import type {
  TeachingSubjectSearchResponse,
  UserTeachingSubject,
  UserTeachingSubjectInput,
} from "@/types/user-teaching-subject";

export async function fetchUserTeachingSubjects(
  userId: number,
): Promise<UserTeachingSubject[]> {
  const res = await axiosClient.get<{ data: UserTeachingSubject[] }>(
    `users/${userId}/teaching-subjects`,
  );
  return res.data.data ?? [];
}

export async function createUserTeachingSubject(
  userId: number,
  input: UserTeachingSubjectInput,
): Promise<UserTeachingSubject> {
  const res = await axiosClient.post<{ data: UserTeachingSubject }>(
    `users/${userId}/teaching-subjects`,
    input,
  );
  return res.data.data;
}

export async function updateUserTeachingSubject(
  userId: number,
  rowId: number,
  input: Partial<UserTeachingSubjectInput>,
): Promise<UserTeachingSubject> {
  const res = await axiosClient.patch<{ data: UserTeachingSubject }>(
    `users/${userId}/teaching-subjects/${rowId}`,
    input,
  );
  return res.data.data;
}

export async function deleteUserTeachingSubject(
  userId: number,
  rowId: number,
): Promise<void> {
  await axiosClient.delete(`users/${userId}/teaching-subjects/${rowId}`);
}

export type TeachingSubjectSearchParams = {
  q?: string;
};

export async function searchTeachingSubjects(
  userId: number,
  params: TeachingSubjectSearchParams = {},
): Promise<TeachingSubjectSearchResponse> {
  const res = await axiosClient.get<{ data: TeachingSubjectSearchResponse }>(
    `users/${userId}/teaching-subjects/search`,
    { params },
  );
  return res.data.data;
}
