import { axiosClient } from "@/lib/api";
import type { UserCertification, UserCertificationInput } from "@/types/user-certification";

export async function fetchUserCertifications(userId: number): Promise<UserCertification[]> {
  const res = await axiosClient.get<{ data: UserCertification[] }>(
    `users/${userId}/certifications`,
  );
  return res.data.data ?? [];
}

export async function createUserCertification(
  userId: number,
  input: UserCertificationInput,
): Promise<UserCertification> {
  const res = await axiosClient.post<{ data: UserCertification }>(
    `users/${userId}/certifications`,
    input,
  );
  return res.data.data;
}

export async function updateUserCertification(
  userId: number,
  certId: number,
  input: Partial<UserCertificationInput>,
): Promise<UserCertification> {
  const res = await axiosClient.patch<{ data: UserCertification }>(
    `users/${userId}/certifications/${certId}`,
    input,
  );
  return res.data.data;
}

export async function deleteUserCertification(userId: number, certId: number): Promise<void> {
  await axiosClient.delete(`users/${userId}/certifications/${certId}`);
}
