export enum LeaveRequestStatus {
  Pending = "pending",
  Approved = "approved",
  Denied = "denied",
  Cancelled = "cancelled",
}

export type LeaveRequestStudent = {
  id: number;
  name: string;
  email?: string;
};

export type LeaveRequestReviewer = {
  id: number;
  name: string;
};

export type LeaveRequestAttachment = {
  id: number;
  filename?: string;
  file_type?: string;
  data?: string | null;
  public_data?: string | null;
  is_image?: boolean;
  size?: number | null;
};

export type LeaveRequest = {
  id: number;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveRequestStatus;
  denial_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  student?: LeaveRequestStudent | number;
  reviewed_by?: LeaveRequestReviewer | number | null;
  attachment?: LeaveRequestAttachment | number | null;
};
