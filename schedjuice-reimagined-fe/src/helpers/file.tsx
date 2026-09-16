import { makePostRequest } from "@/app/client-api/utils";
import { extendedFileType } from "@/components/form/file-drag-and-drop";

import {
  fileType,
  questiomTypeEnum, quizType
} from "@/config/quiz";
import { attachmentType } from "@/types/attachment";
import { MD5 } from "crypto-js";
import { uploadToJuiceBoxMultipart } from "@/lib/juicebox/upload";

// Centralized allowed file types
export const ALLOWED_MIME_TYPES: string[] = [
  // Images
  "image/*",
  // Videos
  "video/*",
  // PDF
  "application/pdf",
  // Microsoft Office
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-powerpoint", // .ppt
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  // CSV
  "text/csv",
];

export const ALLOWED_ACCEPT_FOR_DROPZONE: Record<string, string[]> = {
  "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"],
  "video/*": [".mp4", ".mov", ".mkv", ".avi", ".webm"],
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
  "text/csv": [".csv"],
};

export const ALLOWED_ACCEPT_INPUT: string = [
  "image/*",
  "video/*",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".csv",
].join(",");

const NO_VIDEO_DROPZONE_ENTRIES = Object.entries(ALLOWED_ACCEPT_FOR_DROPZONE).filter(
  ([mime]) => mime !== "video/*",
);

export const ALLOWED_ACCEPT_NO_VIDEO_FOR_DROPZONE: Record<string, string[]> =
  Object.fromEntries(NO_VIDEO_DROPZONE_ENTRIES);

export const ALLOWED_ACCEPT_NO_VIDEO_INPUT: string = [
  "image/*",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".csv",
].join(",");

export const NON_IMAGE_ACCEPT_FOR_DROPZONE: Record<string, string[]> =
  Object.fromEntries(
    Object.entries(ALLOWED_ACCEPT_FOR_DROPZONE).filter(
      ([mime]) => mime !== "image/*",
    ),
  );

export const NON_IMAGE_ACCEPT_INPUT: string = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".csv",
].join(",");

const RASTER_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic", ".heif"];

export function isRasterImageFilename(filename: string | undefined | null): boolean {
  const name = (filename ?? "").trim().toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  return RASTER_IMAGE_EXTENSIONS.includes(name.slice(dot));
}

export const isAllowedFileTypeNoVideo = (file: File) => {
  const type = file.type || "";
  if (type.startsWith("video/")) return false;
  if (type.startsWith("image/")) return true;
  if (!type) {
    const name = (file.name || "").toLowerCase();
    return (
      name.endsWith(".png") ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".gif") ||
      name.endsWith(".webp") ||
      name.endsWith(".pdf") ||
      name.endsWith(".doc") ||
      name.endsWith(".docx") ||
      name.endsWith(".xls") ||
      name.endsWith(".xlsx") ||
      name.endsWith(".ppt") ||
      name.endsWith(".pptx") ||
      name.endsWith(".csv")
    );
  }
  return ALLOWED_MIME_TYPES.filter((mime) => mime !== "video/*").includes(type);
};

export const prepareFiles = (files: extendedFileType[]) => {
  const arr: {
    created: FormData[];
    deleted: any[];
  } = {
    created: [],
    deleted: [],
  };
  files
    .filter((f) => "file" in f && f.file)
    .map((f) => {
      if ("file" in f) {
        const formData = new FormData();
        formData.append("data", f.file!);
        formData.append("name", f.file!.name);

        formData.append("is_image", new Boolean(isImage(f.file)).toString());
        // @ts-ignore
        formData.append("reference_key", f.reference_key);
        if (f.fileType) {
          formData.append("file_type", f.fileType);
        }
        arr.created.push(formData);
      }
    });
  files
    .filter((f) => "isRemoved" in f && f.isRemoved)
    .map((f) => {
      arr.deleted.push({ id: f.id });
    });
  return arr;
};

export const isImage = (file: File) => {
  const validImageTypes = [
    "image/gif",
    "image/jpeg",
    "image/png",
    "images/jpg",
  ];
  return validImageTypes.includes(file["type"]);
};

export const isAllowedFileType = (file: File) => {
  const type = file.type || "";
  if (!type) {
    const name = (file.name || "").toLowerCase();
    return (
      name.endsWith(".png") ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".gif") ||
      name.endsWith(".webp") ||
      name.endsWith(".mp4") ||
      name.endsWith(".mov") ||
      name.endsWith(".mkv") ||
      name.endsWith(".avi") ||
      name.endsWith(".webm") ||
      name.endsWith(".pdf") ||
      name.endsWith(".doc") ||
      name.endsWith(".docx") ||
      name.endsWith(".xls") ||
      name.endsWith(".xlsx") ||
      name.endsWith(".ppt") ||
      name.endsWith(".pptx") ||
      name.endsWith(".csv")
    );
  }
  if (type.startsWith("image/")) return true;
  if (type.startsWith("video/")) return true;
  return ALLOWED_MIME_TYPES.includes(type);
};

export const getFileType = (file: File) => {
  if (isImage(file)) {
    return fileType.image;
  }
  if (file["type"] === "audio/mpeg") {
    return fileType.audio;
  } else return fileType.document;
};

export const downloadCsv = (data: any, filename = "data.csv") => {
  const blob = new Blob([data], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  downloadFile(url, filename);
};

export const downloadFile = (url: string, filename: string) => {
  const fakeATag = document.createElement("a");
  fakeATag.href = url;
  fakeATag.download = filename;
  // Intentionally no target="_blank" — improves download behavior on Safari/iOS
  document.body.appendChild(fakeATag);
  fakeATag.click();
  fakeATag.parentNode?.removeChild(fakeATag);
};

export const extractFilesFromQuiz = (quiz: quizType) => {
  const files: any = [];
  quiz.sections.map((s) => {
    s.questions.map((q) => {
      if (q.questionType === questiomTypeEnum.Enum.file) {
        files.push(q);
      }
    });
  });
  return files;
};

export const requestDataToExtendedFileTypeArray = (data: any) => {
  return data.data.data.map((d: any) => ({
    src: d.data,
    id: d.id,
    name: d.name,
    is_image: d.is_image,
    reference_key: d.reference_key,
  }));
};

export type Chunk = {
  chunk: Blob;
  start: number;
  length: number;
};

export const parseFileAsChunks = (
  file: File,
  onChunkCallback: (chunk: Chunk, isLastChunk: boolean) => void,
  chunkSize = 1024 * 1024 // 1MB
) => {
  for (let start = 0; start < file.size; start += chunkSize) {
    const chunk = file.slice(start, start + chunkSize);
    const size = chunk.size;
    const isLastChunk = start + size >= file.size;
    onChunkCallback(
      {
        chunk,
        start,
        length: size,
      },
      isLastChunk
    );
  }
};

export const getMd5Checksum = (
  file: File,
  onSuccess: (md5: string) => void
) => {
  const reader = new FileReader();
  reader.onload = function (e) {
    //@ts-ignore
    const md5 = MD5(e.target?.result).toString();
    onSuccess(md5);
  };
  reader.readAsArrayBuffer(file);
};

export const uploadAttachments = async (
  files: (File | attachmentType)[],
  tableName: string,
  foreignKey: string,

  // delete all previous attachments
  purge = false,
  isPublic = false
) => {
  const formData = new FormData();

  if (purge) {
    formData.append("purge", "True");
  }
  formData.append("length", files.length.toString());
  files
    .filter((f) => f instanceof File)
    .forEach((file, i) => {
      formData.append(`file${i}`, file as File);
      formData.append(`name${i}`, (file as File).name);
      formData.append(
        `is_image${i}`,
        new Boolean(isImage(file as File)).toString()
      );
      formData.append(`file_type${i}`, (file as File).type);
    });
  if (isPublic) {
    formData.append("is_public", "True");
  }

  formData.append("table_name", tableName);
  formData.append("foreign_key", foreignKey);

  const res = await makePostRequest("attachments", formData);
  return res;
};

/** Response from POST `attachments` after upload: `{ data: [{ id, ... }] }` on axios `data`. */
export function parseAttachmentUploadIds(res: {
  data?: { data?: Array<{ id?: number }> };
}): number[] {
  const rows = res?.data?.data;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((x) => Number(x?.id))
    .filter((id) => Number.isFinite(id));
}

interface uploadToJuiceBoxProps {
  files: (File | attachmentType)[];
  tableName: string;
  foreignKey: string;
  isPublic?: boolean;
  purge?: boolean;
}

export async function uploadToJuiceBox({
  files,
  tableName,
  foreignKey,
  isPublic = false,
  purge = false,
}: uploadToJuiceBoxProps) {
  const candidateUploads =
    (files.filter((f) => f instanceof File) as File[]) || [];
  const uploads = candidateUploads.filter((f) => isAllowedFileType(f));

  if (uploads.length === 0) {
    return { attachments: [] };
  }

  return uploadToJuiceBoxMultipart({
    files: uploads,
    tableName,
    foreignKey,
    isPublic,
    purge,
  });
}

export const exportReportToCSV = (data: string[][], filename = "classes-report.csv") => {
  const escapeCell = (cell: string) => {
    if (cell.includes('"') || cell.includes(",") || cell.includes("\n")) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  };

  const csvContent = data
    .map(row => row.map(escapeCell).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}
