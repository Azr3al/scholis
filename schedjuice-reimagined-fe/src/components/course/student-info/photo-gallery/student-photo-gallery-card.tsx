"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/primitives";
import FullScreenImageViewer from "@/components/images/full-screen-image-viewer";
import { UserImageUploadDialog } from "@/components/users/user-image-upload-dialog";
import { StudentPhotoHistorySheet } from "@/components/course/student-info/student-photo-history-sheet";
import { cn } from "@/lib/utils";
import type { StudentPhotoTypeFilter } from "@/hooks/course-student-info/use-course-student-photo-filters";
import {
  USER_IMAGE_TYPE_LABELS,
  type UserImageType,
} from "@/types/user-image";
import type { accountType } from "@/types/user";

type PhotoSlotProps = {
  label: string;
  url: string | null;
  source: string | null;
  imageType: UserImageType;
  canUpload: boolean;
  canView: boolean;
  studentId: number;
  studentName: string | null;
  courseId: number;
  recordQueryKey: unknown[];
  onPreview: (url: string, title: string) => void;
};

function PhotoSlot({
  label,
  url,
  source,
  imageType,
  canUpload,
  canView,
  studentId,
  studentName,
  courseId,
  recordQueryKey,
  onPreview,
}: PhotoSlotProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!canView) return null;

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {source === "legacy_id_photo" ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            Legacy
          </span>
        ) : null}
      </div>
      <button
        type="button"
        className={cn(
          "mb-2 flex h-28 w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/20 p-2",
          url ? "cursor-zoom-in" : "cursor-default",
        )}
        onClick={() => url && onPreview(url, `${studentName ?? "Student"} ${label}`)}
        disabled={!url}
      >
        {url ? (
          <Image
            src={url}
            alt={`${studentName ?? "Student"} ${label}`}
            width={120}
            height={120}
            className="max-h-24 w-auto object-contain"
            unoptimized
          />
        ) : (
          <span className="text-xs text-muted-foreground">No photo</span>
        )}
      </button>
      <div className="flex flex-wrap gap-2">
        {canUpload ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setUploadOpen(true)}
          >
            Upload
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setHistoryOpen(true)}
        >
          History
        </Button>
      </div>
      {canUpload ? (
        <UserImageUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          userId={studentId}
          imageType={imageType}
          courseId={courseId}
          recordQueryKey={recordQueryKey}
        />
      ) : null}
      <StudentPhotoHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        userId={studentId}
        userName={studentName}
        imageType={imageType}
      />
    </div>
  );
}

export type StudentPhotoGalleryCardProps = {
  student: { id: number; name: string | null; email?: string | null };
  typeFilter: StudentPhotoTypeFilter;
  idUrl: string | null;
  awardUrl: string | null;
  idSource: string | null;
  awardSource: string | null;
  canUploadId: boolean;
  canUploadAward: boolean;
  canViewId: boolean;
  canViewAward: boolean;
  courseId: number;
  recordQueryKey: unknown[];
};

export function StudentPhotoGalleryCard({
  student,
  typeFilter,
  idUrl,
  awardUrl,
  idSource,
  awardSource,
  canUploadId,
  canUploadAward,
  canViewId,
  canViewAward,
  courseId,
  recordQueryKey,
}: StudentPhotoGalleryCardProps) {
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(
    null,
  );

  const showId = typeFilter === "all" || typeFilter === "id";
  const showAward = typeFilter === "all" || typeFilter === "award";

  return (
    <div className="rounded-lg border border-border p-4">
      <Link
        href={`/users/${student.id}`}
        className="mb-3 block truncate text-sm font-medium hover:underline"
      >
        {student.name ?? student.email ?? `Student #${student.id}`}
      </Link>
      <div className={cn("flex gap-3", typeFilter === "all" ? "flex-row" : "flex-col")}>
        {showId ? (
          <PhotoSlot
            label={USER_IMAGE_TYPE_LABELS.id_image}
            url={idUrl}
            source={idSource}
            imageType="id_image"
            canUpload={canUploadId}
            canView={canViewId}
            studentId={student.id}
            studentName={student.name}
            courseId={courseId}
            recordQueryKey={recordQueryKey}
            onPreview={(url, title) => setPreview({ url, title })}
          />
        ) : null}
        {showAward ? (
          <PhotoSlot
            label={USER_IMAGE_TYPE_LABELS.award_image}
            url={awardUrl}
            source={awardSource}
            imageType="award_image"
            canUpload={canUploadAward}
            canView={canViewAward}
            studentId={student.id}
            studentName={student.name}
            courseId={courseId}
            recordQueryKey={recordQueryKey}
            onPreview={(url, title) => setPreview({ url, title })}
          />
        ) : null}
      </div>
      {preview ? (
        <FullScreenImageViewer
          imageUrl={preview.url}
          title={preview.title}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}
