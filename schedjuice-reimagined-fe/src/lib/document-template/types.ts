export type DocumentTemplateScope = "org" | "user";
export type DocumentTemplateStatus = "draft" | "published";

export type DocumentTemplate = {
  id: number;
  name: string;
  scope: DocumentTemplateScope;
  owner_id: number | null;
  document: unknown;
  published_document: unknown | null;
  status: DocumentTemplateStatus;
  updated_at: string;
  created_by_id: number | null;
};

export type DocumentPagePreset =
  | "a4_portrait"
  | "a4_landscape"
  | "letter_portrait"
  | "custom";

export type DocumentPage = {
  preset: DocumentPagePreset;
  width: number;
  height: number;
  unit: "mm";
};

export type TextAlign = "left" | "center" | "right";

export type TextBlock = {
  id: string;
  type: "text";
  text: string;
  align: TextAlign;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
};

export type ImageBlock = {
  id: string;
  type: "image";
  url: string | null;
  width: number;
  align: TextAlign;
};

export type ColumnChild = TextBlock | ImageBlock;

export type ColumnsBlock = {
  id: string;
  type: "columns";
  columns: [ColumnChild[], ColumnChild[]];
};

export type GradesTableColumnKey =
  | "subject_name"
  | "mark"
  | "letter_grade"
  | "comment";

export type GradesTableBlock = {
  id: string;
  type: "grades_table";
  columns: { key: GradesTableColumnKey; label: string }[];
};

export type DocumentBlock =
  | TextBlock
  | ImageBlock
  | ColumnsBlock
  | GradesTableBlock;

export type BlockDocument = {
  version: 1;
  page: DocumentPage;
  blocks: DocumentBlock[];
};

export type InsertableBlockType = DocumentBlock["type"];

