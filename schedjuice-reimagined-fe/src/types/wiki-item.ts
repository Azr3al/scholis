export enum WikiItemType {
  File = "file",
  Link = "link",
  Content = "content",
}

export type WikiItem = {
  id: number;
  name: string;
  code: string;
  content?: Record<string, unknown> | null;
  url?: string | null;
  item_type: WikiItemType | null;
  is_folder: boolean;
  parent: number | null;
  course: number;
  created_by: number;
  created_at: string;
  updated_at: string;
};
