import { axiosClient } from "@/lib/api";

export type MobileDeviceUser = {
  id: number;
  full_name: string;
  email: string;
};

export type MobileDeviceRow = {
  id: number;
  user?: MobileDeviceUser;
  display_name: string;
  device_model: string | null;
  os_name: string | null;
  os_version: string | null;
  app_version: string | null;
  is_active: boolean;
  first_seen_at: string;
  last_seen_at: string | null;
  active_session_id: string | null;
  revoked_at: string | null;
};

export type MobileDeviceListResponse = {
  items: MobileDeviceRow[];
  count: number;
};

export type MobileDeviceFilters = {
  user_id?: number;
  is_active?: boolean;
  q?: string;
  stale_days?: number;
  page?: number;
  size?: number;
};

export function mobileDevicesQueryKey(filters: MobileDeviceFilters = {}) {
  return ["mobile-devices", filters] as const;
}

export function userMobileDevicesQueryKey(userId: number) {
  return mobileDevicesQueryKey({ user_id: userId });
}

export async function listUserMobileDevices(
  userId: number,
): Promise<MobileDeviceListResponse> {
  const res = await axiosClient.get<{ data: MobileDeviceListResponse }>(
    `users/${userId}/mobile-devices`,
    { params: { size: 50 } },
  );
  const data = res.data.data;
  return { items: data.items ?? [], count: data.count ?? 0 };
}

export async function revokeMobileDevice(deviceId: number): Promise<void> {
  await axiosClient.post(`mobile-devices/${deviceId}/revoke`);
}

export type BulkRevokeMobileDevicesResult = {
  revoked_count: number;
  sessions_revoked: number;
  device_ids: number[];
};

export async function listMobileDevices(
  filters: MobileDeviceFilters = {},
): Promise<MobileDeviceListResponse> {
  const params: Record<string, string | number | boolean> = {};
  if (filters.user_id != null) params.user_id = filters.user_id;
  if (filters.is_active != null) params.is_active = filters.is_active;
  if (filters.q?.trim()) params.q = filters.q.trim();
  if (filters.stale_days != null) params.stale_days = filters.stale_days;
  if (filters.page != null) params.page = filters.page;
  params.size = filters.size ?? 25;

  const res = await axiosClient.get<{ data: MobileDeviceListResponse }>(
    "mobile-devices",
    { params },
  );
  const data = res.data.data;
  return { items: data.items ?? [], count: data.count ?? 0 };
}

export async function bulkRevokeMobileDevices(body: {
  device_ids?: number[];
  user_id?: number;
}): Promise<BulkRevokeMobileDevicesResult> {
  const res = await axiosClient.post<{ data: BulkRevokeMobileDevicesResult }>(
    "mobile-devices/bulk-revoke",
    body,
  );
  return res.data.data;
}

export async function revokeStaleMobileDevices(
  inactiveDays = 90,
): Promise<BulkRevokeMobileDevicesResult> {
  const res = await axiosClient.post<{ data: BulkRevokeMobileDevicesResult }>(
    "mobile-devices/revoke-stale",
    { inactive_days: inactiveDays },
  );
  return res.data.data;
}
