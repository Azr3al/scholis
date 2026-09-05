export type JuiceBoxAttachmentRow = {
  id: number;
  filename: string;
  file_type: string;
  size?: number | null;
  downloadUrl?: string | null;
  download_url?: string | null;
  is_image?: boolean;
  table_name?: string;
};

export type JuiceBoxUploadResponse = {
  attachments?: JuiceBoxAttachmentRow[];
};

export type JuiceBoxAttachmentsResponse = {
  attachments?: JuiceBoxAttachmentRow[];
};
