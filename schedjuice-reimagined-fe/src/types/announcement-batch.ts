export type AnnouncementBatchCreatedRow = {
  id: number;
  course_id: number;
};

export type AnnouncementBatchFailedRow = {
  course_id: number;
  error: string;
};

export type AnnouncementBatchCreateResult = {
  created: AnnouncementBatchCreatedRow[];
  failed: AnnouncementBatchFailedRow[];
};
