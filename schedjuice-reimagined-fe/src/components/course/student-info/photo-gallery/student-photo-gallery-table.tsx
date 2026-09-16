"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/primitives";
import FullScreenImageViewer from "@/components/images/full-screen-image-viewer";
import { UserImageUploadDialog } from "@/components/users/user-image-upload-dialog";
import { StudentPhotoHistorySheet } from "@/components/course/student-info/student-photo-history-sheet";
import {
  courseOperationalTableBodyCellClassName,
  courseOperationalTableClassName,
  courseOperationalTableHeadCellClassName,
  courseOperationalTableHeadRowClassName,
  courseOperationalTableShellClassName,
} from "@/lib/ui-remediation/r9-course-record-layout-classes";
import type { StudentPhotoTypeFilter } from "@/hooks/course-student-info/use-course-student-photo-filters";
import type { UserImageType } from "@/types/user-image";

export type StudentPhotoRow = {
  id: number;
  name: string | null;
  email: string | null;
  idUrl: string | null;
  awardUrl: string | null;
  idSource: string | null;
  canUploadId: boolean;
  canUploadAward: boolean;
  canViewId: boolean;
  canViewAward: boolean;
};

function ThumbnailCell({
  url,
  label,
  onPreview,
}: {
  url: string | null;
  label: string;
  onPreview: (url: string) => void;
}) {
  if (!url) {
    return <span className="text-xs text-muted-foreground">No photo</span>;
  }
  return (
    <button type="button" onClick={() => onPreview(url)} className="cursor-zoom-in">
      <Image
        src={url}
        alt={label}
        width={48}
        height={48}
        className="h-12 w-12 rounded object-cover"
        unoptimized
      />
    </button>
  );
}

function RowActions({
  student,
  imageType,
  canUpload,
  courseId,
  recordQueryKey,
}: {
  student: StudentPhotoRow;
  imageType: UserImageType;
  canUpload: boolean;
  courseId: number;
  recordQueryKey: unknown[];
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="flex gap-2">
      {canUpload ? (
        <Button type="button" variant="secondary" size="sm" onClick={() => setUploadOpen(true)}>
          Upload
        </Button>
      ) : null}
      <Button type="button" variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
        History
      </Button>
      {canUpload ? (
        <UserImageUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          userId={student.id}
          imageType={imageType}
          courseId={courseId}
          recordQueryKey={recordQueryKey}
        />
      ) : null}
      <StudentPhotoHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        userId={student.id}
        userName={student.name}
        imageType={imageType}
      />
    </div>
  );
}

export function StudentPhotoGalleryTable({
  rows,
  typeFilter,
  courseId,
  recordQueryKey,
}: {
  rows: StudentPhotoRow[];
  typeFilter: StudentPhotoTypeFilter;
  courseId: number;
  recordQueryKey: unknown[];
}) {
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const showId = typeFilter === "all" || typeFilter === "id";
  const showAward = typeFilter === "all" || typeFilter === "award";

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No students match your search.</p>
    );
  }

  return (
    <>
      <div className={courseOperationalTableShellClassName()}>
        <table className={courseOperationalTableClassName()}>
          <thead>
            <tr className={courseOperationalTableHeadRowClassName()}>
              <th className={courseOperationalTableHeadCellClassName()}>Student</th>
              {showId ? (
                <th className={courseOperationalTableHeadCellClassName()}>ID Photo</th>
              ) : null}
              {showAward ? (
                <th className={courseOperationalTableHeadCellClassName()}>Award Photo</th>
              ) : null}
              <th className={courseOperationalTableHeadCellClassName()}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border-subtle">
                <td className={courseOperationalTableBodyCellClassName()}>
                  <Link href={`/users/${row.id}`} className="font-medium hover:underline">
                    {row.name ?? row.email ?? `Student #${row.id}`}
                  </Link>
                </td>
                {showId ? (
                  <td className={courseOperationalTableBodyCellClassName()}>
                    {row.canViewId ? (
                      <ThumbnailCell
                        url={row.idUrl}
                        label="ID photo"
                        onPreview={(url) =>
                          setPreview({ url, title: `${row.name ?? "Student"} ID Photo` })
                        }
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                ) : null}
                {showAward ? (
                  <td className={courseOperationalTableBodyCellClassName()}>
                    {row.canViewAward ? (
                      <ThumbnailCell
                        url={row.awardUrl}
                        label="Award photo"
                        onPreview={(url) =>
                          setPreview({ url, title: `${row.name ?? "Student"} Award Photo` })
                        }
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                ) : null}
                <td className={courseOperationalTableBodyCellClassName()}>
                  <div className="flex flex-col gap-2">
                    {showId && row.canViewId ? (
                      <RowActions
                        student={row}
                        imageType="id_image"
                        canUpload={row.canUploadId}
                        courseId={courseId}
                        recordQueryKey={recordQueryKey}
                      />
                    ) : null}
                    {showAward && row.canViewAward ? (
                      <RowActions
                        student={row}
                        imageType="award_image"
                        canUpload={row.canUploadAward}
                        courseId={courseId}
                        recordQueryKey={recordQueryKey}
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview ? (
        <FullScreenImageViewer
          imageUrl={preview.url}
          title={preview.title}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </>
  );
}
