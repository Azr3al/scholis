"use client";

import { fetchUserImageUrls } from "@/app/client-api/user-images";
import { makeGetRequest, searchEntities } from "@/app/client-api/utils";
import EntityCombobox from "@/components/form/entity-combobox";
import { Dialog } from "@/components/primitives";
import { bindAwardPreview, readMainTeacher } from "@/lib/image-template/bind-award-preview";
import { composite } from "@/lib/image-template/composite";
import type { AwardDocument } from "@/lib/image-template/types";
import { operatorEnum } from "@/types/api";
import { seniorityEnum } from "@/types/course";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

type CoursePick = { id: number; title: string };

type RosterStudent = {
  id: number;
  name: string;
  gender?: string | null;
};

function readRoster(payload: unknown): RosterStudent[] {
  const list = (payload as { data?: { data?: unknown } } | undefined)?.data?.data;
  if (!Array.isArray(list)) return [];
  return [...list]
    .map((row) => {
      const record = row as { id?: unknown; name?: unknown; gender?: unknown };
      return {
        id: Number(record.id),
        name: typeof record.name === "string" ? record.name : "",
        gender: typeof record.gender === "string" ? record.gender : null,
      };
    })
    .filter((row) => Number.isFinite(row.id))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function AwardPreviewDialog({
  open,
  onOpenChange,
  document,
  awardTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: AwardDocument | null;
  awardTitle: string;
}) {
  const [courseValue, setCourseValue] = useState("");
  const [course, setCourse] = useState<CoursePick | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setCourseValue("");
    setCourse(null);
    setSelectedId(null);
    setPreviewUrl(null);
  }, [open]);

  const studentsQuery = useQuery({
    queryKey: ["award-preview-students", course?.id],
    queryFn: () => makeGetRequest(`courses/${course?.id}/students`),
    enabled: open && course != null,
  });
  const students = useMemo(() => readRoster(studentsQuery.data), [studentsQuery.data]);

  useEffect(() => {
    if (!course || students.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId != null && students.some((row) => row.id === selectedId)) return;
    setSelectedId(students[0]?.id ?? null);
  }, [course, students, selectedId]);

  const selected = students.find((row) => row.id === selectedId) ?? null;

  const photoQuery = useQuery({
    queryKey: ["award-preview-photo", selected?.id],
    queryFn: () => fetchUserImageUrls([selected!.id], "award_image"),
    enabled: open && selected != null,
  });
  const awardImageUrl =
    selected == null ? null : (photoQuery.data?.urls?.[String(selected.id)] ?? null);

  const mtQuery = useQuery({
    queryKey: ["award-preview-mt", course?.id],
    queryFn: () =>
      searchEntities(
        "user-courses",
        { size: -1, expand: ["user", "assigned_as_role"] },
        {
          filter_params: [
            {
              field_name: "course_id",
              operator: operatorEnum.exact,
              value: String(course?.id),
            },
            {
              field_name: "assigned_as_role__seniority",
              operator: operatorEnum.exact,
              value: seniorityEnum.MAIN_TEACHER,
            },
          ],
        },
      ),
    enabled: open && course != null,
  });
  const mt = readMainTeacher(mtQuery.data);
  const mtName = mt.name;
  const mtSignatureUrl = mt.signatureUrl;

  useEffect(() => {
    if (!open || !document) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    const tokens = selected == null;
    const binder = bindAwardPreview({
      studentName: selected?.name ?? "",
      courseName: course?.title ?? "",
      awardTitle,
      gender: selected?.gender,
      awardImageUrl,
      mtName,
      mtSignatureUrl,
    });
    void composite(document, binder, { tokens }).then((canvas) => {
      if (cancelled) return;
      setPreviewUrl(canvas.toDataURL("image/png"));
    });
    return () => {
      cancelled = true;
    };
  }, [open, document, selected, course, awardTitle, awardImageUrl, mtName, mtSignatureUrl]);

  const moveSelection = (delta: number) => {
    if (students.length === 0) return;
    const index = Math.max(
      0,
      students.findIndex((row) => row.id === selectedId),
    );
    const next = students[(index + delta + students.length) % students.length];
    if (next) setSelectedId(next.id);
  };

  const onRailKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup
          data-theme="light"
          className="h-[min(80vh,40rem)] w-[calc(100vw-2rem)] max-w-5xl sm:max-w-5xl"
        >
          <div className="flex shrink-0 items-center justify-between gap-3">
            <Dialog.Title>Preview</Dialog.Title>
            <div className="w-64 shrink-0">
              <EntityCombobox
                label="Course"
                hideLabel
                entity="courses"
                displayFunction={(item) => item.title}
                value={courseValue}
                onChange={(next) => {
                  setCourseValue(next);
                  if (!next) {
                    setCourse(null);
                    setSelectedId(null);
                  }
                }}
                onSelectedEntityChange={(entity) => {
                  if (!entity) {
                    setCourse(null);
                    setSelectedId(null);
                    return;
                  }
                  setCourse({
                    id: Number(entity.id),
                    title: String(entity.title ?? ""),
                  });
                }}
                queryParams={{ fields: ["id", "title"], sorts: ["title"] }}
                comboboxPlaceholder="Select a course"
              />
            </div>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-[12rem_minmax(0,1fr)] gap-3">
            <div
              role="listbox"
              aria-label="Students"
              tabIndex={0}
              className="min-h-0 overflow-auto rounded-md border border-border bg-surface-sunken p-1"
              onKeyDown={onRailKeyDown}
            >
              {!course ? (
                <p className="px-2 py-1 text-sm text-text-muted">Select a course</p>
              ) : studentsQuery.isLoading ? (
                <p className="px-2 py-1 text-sm text-text-muted">Loading…</p>
              ) : students.length === 0 ? (
                <p className="px-2 py-1 text-sm text-text-muted">
                  No students in this course
                </p>
              ) : (
                students.map((student) => {
                  const active = student.id === selectedId;
                  return (
                    <button
                      key={student.id}
                      type="button"
                      role="option"
                      aria-pressed={active}
                      aria-selected={active}
                      data-selected={active ? "true" : "false"}
                      className={`w-full truncate rounded px-2 py-1.5 text-left text-sm ${
                        active
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-text-primary hover:bg-surface"
                      }`}
                      onClick={() => setSelectedId(student.id)}
                    >
                      {student.name}
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex min-h-0 items-center justify-center overflow-auto rounded-md border border-border bg-surface-sunken p-3">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={
                    selected
                      ? `Preview for ${selected.name}`
                      : "Preview with template variables"
                  }
                  src={previewUrl}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <p className="text-sm text-text-muted">Loading preview…</p>
              )}
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
