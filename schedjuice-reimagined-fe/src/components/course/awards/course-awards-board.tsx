"use client";

import { ADD_AWARD_BUTTON_CLASS } from "@/lib/awards/add-award-visibility";
import {
  awardsZipFileName,
  collectAwardPngs,
  downloadAwardsZip,
  downloadPngDataUrl,
} from "@/lib/awards/award-download";
import { hasAnyGrant, studentsWithGrants } from "@/lib/awards/board-students";
import { awardDocumentFromTemplate } from "@/lib/awards/award-document";
import {
  createAwardGrantBatch,
  deleteAwardGrant,
  getCourseAwards,
  promoteAwardTitle,
} from "@/lib/awards-api";
import { getTodayYmd } from "@/helpers/attendance-marking";
import { useCourseHub } from "@/contexts/course-hub-context";
import { useTenant } from "@/hooks/useTenant";
import { fetchCourseMainTeacher } from "@/lib/awards/course-main-teacher";
import { useCourseStudentPhotoUrls } from "@/hooks/course-student-info/use-course-student-photo-urls";
import { bindAwardPreview } from "@/lib/image-template/bind-award-preview";
import { composite } from "@/lib/image-template/composite";
import {
  crossfadeInstant,
  crossfadeOpacity,
  listItemPresence,
  listItemPresenceReduced,
  staggerItemOpacity,
  staggerList,
} from "@/lib/sj/motion";
import {
  formatAwardFamily,
  type AwardBoardStudent,
  type AwardDisplayTemplate,
  type AwardGrantChip,
} from "@/types/award";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { format } from "date-fns";
import { MoreHoriz, Xmark } from "iconoir-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Button,
  Dialog,
  Menu,
  Skeleton,
} from "@/components/primitives";
import { useToast } from "@/components/primitives/toast";
import { EmptyCopy, EMPTY_COPY_PRESETS } from "@/components/primitives/empty";
import { SearchField } from "@/components/form/search-field";
import {
  ToolbarSegmentGroup,
  ToolbarSegmentToggle,
} from "@/components/shell/toolbar-segment-group";
import FullScreenImageViewer from "@/components/images/full-screen-image-viewer";
import { AwardGrantComposer } from "./award-grant-composer";
import { AwardCertificateThumb } from "./award-certificate-thumb";

type Period =
  | { kind: "overall" }
  | { kind: "month"; year: number; month: number };

type MonthOption = { year: number; month: number; label: string };

type BoardView = "gallery" | "list";

function ymdParts(ymd: string): { year: number; month: number; day: number } {
  const [year, month, day] = ymd.split("-").map(Number);
  return { year, month, day };
}

function toYmd(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return null;
}

function monthsOverlapping(startYmd: string, endYmd: string): MonthOption[] {
  const start = ymdParts(startYmd);
  const end = ymdParts(endYmd);
  const months: MonthOption[] = [];
  let year = start.year;
  let month = start.month;
  while (year < end.year || (year === end.year && month <= end.month)) {
    months.push({
      year,
      month,
      label: format(new Date(year, month - 1, 1), "MMM yyyy"),
    });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

function periodKey(period: Period): string {
  if (period.kind === "overall") return "overall";
  return `${period.year}-${period.month}`;
}

function periodLabel(period: Period): string {
  if (period.kind === "overall") return "Overall";
  return format(new Date(period.year, period.month - 1, 1), "MMM yyyy");
}

async function compositeGrantPng(input: {
  studentName: string;
  courseName: string;
  titleName: string;
  display_template: AwardDisplayTemplate;
  awardImageUrl?: string | null;
  mtName?: string;
  mtSignatureUrl?: string | null;
}): Promise<string> {
  const canvas = await composite(
    awardDocumentFromTemplate(input.display_template),
    bindAwardPreview({
      studentName: input.studentName,
      courseName: input.courseName,
      awardTitle: input.titleName,
      awardImageUrl: input.awardImageUrl ?? null,
      mtName: input.mtName,
      mtSignatureUrl: input.mtSignatureUrl ?? null,
    }),
  );
  return canvas.toDataURL("image/png");
}

function flattenGrants(students: AwardBoardStudent[]) {
  return students
    .flatMap((student) =>
      student.grants.map((grant) => ({ student, grant })),
    )
    .sort((a, b) => b.grant.id - a.grant.id);
}

function matchesAwardSearch(
  studentName: string,
  titleName: string,
  needle: string,
) {
  if (!needle) return true;
  return (
    studentName.toLowerCase().includes(needle) ||
    titleName.toLowerCase().includes(needle)
  );
}

const REMOVE_BUTTON_CLASS =
  "shrink-0 rounded p-1 text-danger hover:bg-danger/10 hover:text-danger";

function GrantChip({
  grant,
  reduced,
  onDelete,
  onPromote,
  onDownload,
}: {
  grant: AwardGrantChip;
  reduced: boolean | null;
  onDelete: () => void;
  onPromote: () => void;
  onDownload?: () => void;
}) {
  const local = grant.title.origin === "local";
  const canDownload = grant.title.display_template != null;
  const showMenu = local || canDownload;
  return (
    <motion.span
      layout
      variants={reduced ? listItemPresenceReduced : listItemPresence}
      initial="initial"
      animate="animate"
      exit="exit"
      className="inline-flex max-w-48 items-center gap-1 rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-sm"
    >
      <span className="min-w-0 truncate" title={grant.title.name}>
        {grant.title.name}
      </span>
      <button
        type="button"
        className={REMOVE_BUTTON_CLASS}
        aria-label={`Remove ${grant.title.name}`}
        onClick={onDelete}
      >
        <Xmark className="size-3.5" aria-hidden />
      </button>
      {showMenu ? (
        <Menu.Root>
          <Menu.Trigger
            render={
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-text-muted hover:text-text-primary"
                aria-label={`More actions for ${grant.title.name}`}
              />
            }
          >
            <MoreHoriz className="size-3.5" aria-hidden />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner align="end">
              <Menu.Popup>
                {canDownload ? (
                  <Menu.Item onClick={onDownload}>Download image</Menu.Item>
                ) : null}
                {local ? (
                  <Menu.Item onClick={onPromote}>Promote to catalog</Menu.Item>
                ) : null}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ) : null}
    </motion.span>
  );
}

export function CourseAwardsBoard() {
  const { courseId, course, isCourseLoading } = useCourseHub();
  const { tenant } = useTenant();
  const timezone = tenant?.timezone?.trim() || "UTC";
  const reduced = useReducedMotion();
  const qc = useQueryClient();
  const toast = useToast();
  const [view, setView] = useState<BoardView>("gallery");
  const [composerOpen, setComposerOpen] = useState(false);
  const [precheckedIds, setPrecheckedIds] = useState<number[]>([]);
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(
    null,
  );
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{
    grantId: number;
    titleName: string;
    studentName: string;
  } | null>(null);

  const months = useMemo(() => {
    const start = toYmd(course.start_date);
    const end = toYmd(course.end_date);
    if (!start || !end) return [];
    return monthsOverlapping(start, end);
  }, [course.end_date, course.start_date]);

  const [period, setPeriod] = useState<Period | null>(null);

  const resolvedPeriod: Period = useMemo(() => {
    if (period) return period;
    const today = ymdParts(getTodayYmd(timezone));
    const start = toYmd(course.start_date);
    const end = toYmd(course.end_date);
    if (start && end) {
      const inRange =
        `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}` >=
          start &&
        `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}` <=
          end;
      if (inRange) {
        return { kind: "month", year: today.year, month: today.month };
      }
    }
    return { kind: "overall" };
  }, [course.end_date, course.start_date, period, timezone]);

  const awardsQuery = useQuery({
    queryKey: ["course-awards", courseId, periodKey(resolvedPeriod)],
    queryFn: () =>
      getCourseAwards(courseId, {
        period_kind: resolvedPeriod.kind,
        year: resolvedPeriod.kind === "month" ? resolvedPeriod.year : undefined,
        month: resolvedPeriod.kind === "month" ? resolvedPeriod.month : undefined,
      }),
    enabled: Boolean(courseId) && !isCourseLoading,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["course-awards", courseId] });

  const batchMutation = useMutation({
    mutationFn: (input: {
      title_id?: number | null;
      name?: string | null;
      user_ids: number[];
    }) =>
      createAwardGrantBatch(courseId, {
        ...input,
        period_kind: resolvedPeriod.kind,
        year: resolvedPeriod.kind === "month" ? resolvedPeriod.year : undefined,
        month: resolvedPeriod.kind === "month" ? resolvedPeriod.month : undefined,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAwardGrant,
    onSuccess: () => void invalidate(),
  });

  const promoteMutation = useMutation({
    mutationFn: (titleId: number) => promoteAwardTitle(courseId, titleId),
    onSuccess: () => void invalidate(),
  });

  const picker = awardsQuery.data?.picker ?? {
    pinned: [],
    top10: [],
    local: [],
    other: [],
  };
  const orgTitles = [
    ...picker.pinned,
    ...picker.top10,
    ...picker.other,
  ];
  const localTitles = picker.local;
  const fade = reduced ? crossfadeInstant : crossfadeOpacity;
  const students = awardsQuery.data?.students ?? [];
  const courseName = typeof course.title === "string" ? course.title : "";
  const key = periodKey(resolvedPeriod);
  const anyGrant = hasAnyGrant(students);
  const listed = studentsWithGrants(students);
  const cards = flattenGrants(students);
  const searchNeedle = search.trim().toLowerCase();
  const visibleCards = searchNeedle
    ? cards.filter(({ student, grant }) =>
        matchesAwardSearch(student.name, grant.title.name, searchNeedle),
      )
    : cards;
  const visibleListed = searchNeedle
    ? listed
        .map((student) => ({
          ...student,
          grants: student.grants.filter((grant) =>
            matchesAwardSearch(student.name, grant.title.name, searchNeedle),
          ),
        }))
        .filter((student) => student.grants.length > 0)
    : listed;
  const noSearchMatches =
    Boolean(searchNeedle) &&
    visibleCards.length === 0 &&
    visibleListed.length === 0;
  const photoStudentIds = useMemo(
    () => students.filter((row) => row.grants.length > 0).map((row) => row.id),
    [students],
  );
  const { awardUrls } = useCourseStudentPhotoUrls(photoStudentIds, "award");
  const mtQuery = useQuery({
    queryKey: ["course-awards-mt", courseId],
    queryFn: () => fetchCourseMainTeacher(courseId),
    enabled: Boolean(courseId) && !isCourseLoading && anyGrant,
  });
  const mtName = mtQuery.data?.name ?? "";
  const mtSignatureUrl = mtQuery.data?.signatureUrl ?? null;
  const hasRenderable = cards.some(
    (row) => row.grant.title.display_template != null,
  );

  const openComposer = (ids: number[]) => {
    setPrecheckedIds(ids);
    setComposerOpen(true);
  };

  const requestDelete = (
    student: AwardBoardStudent,
    grant: AwardGrantChip,
  ) => {
    setPendingDelete({
      grantId: grant.id,
      titleName: grant.title.name,
      studentName: student.name,
    });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteMutation.mutate(pendingDelete.grantId, {
      onSuccess: () => setPendingDelete(null),
    });
  };

  const onGrant = async (input: {
    title_id?: number | null;
    name?: string | null;
    user_ids: number[];
  }) => {
    const result = await batchMutation.mutateAsync(input);
    const failedAll =
      result.errors.length > 0 &&
      input.user_ids.every((id) =>
        result.errors.some((row) => row.user === id),
      );
    if (failedAll) {
      toast.add({
        title: result.errors[0]?.message ?? "Could not grant this award.",
      });
    }
    if (result.errors.length === 0) {
      setComposerOpen(false);
    }
    void invalidate();
    return result;
  };

  const downloadGrant = async (
    student: AwardBoardStudent,
    grant: AwardGrantChip,
  ) => {
    const template = grant.title.display_template;
    if (!template) return;
    try {
      const collected = await collectAwardPngs(
        [
          {
            studentName: student.name,
            titleName: grant.title.name,
            periodKey: key,
            display_template: template,
          },
        ],
        (row) =>
          compositeGrantPng({
            studentName: row.studentName,
            courseName,
            titleName: row.titleName,
            display_template: row.display_template,
            awardImageUrl: awardUrls[String(student.id)] ?? null,
            mtName,
            mtSignatureUrl,
          }),
      );
      if (!collected.ok || collected.files.length === 0) {
        toast.add({ title: "Could not download this award." });
        return;
      }
      const file = collected.files[0];
      await downloadPngDataUrl(file.pngDataUrl, file.name);
    } catch {
      toast.add({ title: "Could not download this award." });
    }
  };

  const onDownloadAll = async () => {
    if (downloadingAll) return;
    setDownloadingAll(true);
    try {
      const collected = await collectAwardPngs(
        cards.map((row) => ({
          studentName: row.student.name,
          titleName: row.grant.title.name,
          periodKey: key,
          display_template: row.grant.title.display_template,
        })),
        (row) => {
          const match = cards.find(
            (card) =>
              card.student.name === row.studentName &&
              card.grant.title.name === row.titleName,
          );
          return compositeGrantPng({
            studentName: row.studentName,
            courseName,
            titleName: row.titleName,
            display_template: row.display_template,
            awardImageUrl: match
              ? awardUrls[String(match.student.id)] ?? null
              : null,
            mtName,
            mtSignatureUrl,
          });
        },
      );
      if (!collected.ok) {
        toast.add({ title: "Could not download awards." });
        return;
      }
      if (collected.files.length === 0) return;
      await downloadAwardsZip({
        files: collected.files,
        zipName: awardsZipFileName(courseName, key),
      });
    } catch {
      toast.add({ title: "Could not download awards." });
    } finally {
      setDownloadingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Award period">
          {months.map((option) => {
            const active =
              resolvedPeriod.kind === "month" &&
              resolvedPeriod.year === option.year &&
              resolvedPeriod.month === option.month;
            return (
              <Button
                key={`${option.year}-${option.month}`}
                type="button"
                size="sm"
                variant={active ? "primary" : "secondary"}
                onClick={() =>
                  setPeriod({ kind: "month", year: option.year, month: option.month })
                }
              >
                {option.label}
              </Button>
            );
          })}
          <Button
            type="button"
            size="sm"
            variant={resolvedPeriod.kind === "overall" ? "primary" : "secondary"}
            onClick={() => setPeriod({ kind: "overall" })}
          >
            Overall
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ToolbarSegmentGroup aria-label="View mode">
            <ToolbarSegmentToggle
              active={view === "gallery"}
              onClick={() => setView("gallery")}
            >
              Gallery
            </ToolbarSegmentToggle>
            <ToolbarSegmentToggle
              active={view === "list"}
              onClick={() => setView("list")}
            >
              List
            </ToolbarSegmentToggle>
          </ToolbarSegmentGroup>
          {anyGrant ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={!hasRenderable || downloadingAll}
              isLoading={downloadingAll}
              onClick={() => void onDownloadAll()}
            >
              Download all
            </Button>
          ) : null}
          <Button size="sm" onClick={() => openComposer([])}>
            Grant award
          </Button>
        </div>
      </div>

      <AwardGrantComposer
        open={composerOpen}
        courseId={courseId}
        courseName={courseName}
        periodLabel={periodLabel(resolvedPeriod)}
        students={students}
        picker={picker}
        orgTitles={orgTitles}
        localTitles={localTitles}
        precheckedIds={precheckedIds}
        pending={batchMutation.isLoading}
        onCancel={() => setComposerOpen(false)}
        onGrant={onGrant}
      />

      {anyGrant && !awardsQuery.isLoading && !isCourseLoading && !awardsQuery.isError ? (
        <SearchField
          placeholder="Search students or awards"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      ) : null}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${periodKey(resolvedPeriod)}-${view}`}
          variants={fade}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {awardsQuery.isLoading || isCourseLoading ? (
            <div className="space-y-2" aria-busy>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : awardsQuery.isError ? (
            <p className="text-sm text-danger">Could not load awards.</p>
          ) : !anyGrant ? (
            <div className="flex flex-col items-start gap-3 py-8">
              <EmptyCopy {...EMPTY_COPY_PRESETS.noAwardsThisPeriod} />
              <Button size="sm" onClick={() => openComposer([])}>
                Grant award
              </Button>
            </div>
          ) : noSearchMatches ? (
            <p className="py-8 text-sm text-text-muted">No matching awards.</p>
          ) : view === "gallery" ? (
            <motion.ul
              variants={staggerList}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {visibleCards.map(({ student, grant }) => {
                const template = grant.title.display_template;
                return (
                  <motion.li
                    key={grant.id}
                    variants={staggerItemOpacity}
                    className="rounded-lg border border-border bg-surface p-3"
                  >
                    {template ? (
                      <AwardCertificateThumb
                        studentName={student.name}
                        courseName={courseName}
                        titleName={grant.title.name}
                        template={template}
                        awardImageUrl={awardUrls[String(student.id)] ?? null}
                        mtName={mtName}
                        mtSignatureUrl={mtSignatureUrl}
                        onOpen={(url) =>
                          setPreview({
                            url,
                            title: `${student.name} · ${grant.title.name}`,
                          })
                        }
                      />
                    ) : (
                      <div className="flex min-h-32 flex-col justify-center rounded-md bg-surface-sunken/40 px-3 py-4">
                        <p className="font-medium text-text-primary">
                          {grant.title.name}
                        </p>
                        {grant.title.family ? (
                          <p className="text-sm text-text-muted">
                            {formatAwardFamily(grant.title.family)}
                          </p>
                        ) : null}
                      </div>
                    )}
                    <div className="mt-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {student.name}
                        </p>
                        {template ? (
                          <p className="truncate text-sm text-text-muted">
                            {grant.title.name}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {template ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void downloadGrant(student, grant)}
                          >
                            Download
                          </Button>
                        ) : null}
                        <button
                          type="button"
                          className={REMOVE_BUTTON_CLASS}
                          aria-label={`Remove ${grant.title.name}`}
                          onClick={() => requestDelete(student, grant)}
                        >
                          <Xmark className="size-4" aria-hidden />
                        </button>
                        {grant.title.origin === "local" ? (
                          <Menu.Root>
                            <Menu.Trigger
                              render={
                                <button
                                  type="button"
                                  className="rounded p-1 text-text-muted hover:text-text-primary"
                                  aria-label={`More actions for ${grant.title.name}`}
                                />
                              }
                            >
                              <MoreHoriz className="size-4" aria-hidden />
                            </Menu.Trigger>
                            <Menu.Portal>
                              <Menu.Positioner align="end">
                                <Menu.Popup>
                                  <Menu.Item
                                    onClick={() =>
                                      promoteMutation.mutate(grant.title.id)
                                    }
                                  >
                                    Promote to catalog
                                  </Menu.Item>
                                </Menu.Popup>
                              </Menu.Positioner>
                            </Menu.Portal>
                          </Menu.Root>
                        ) : null}
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </motion.ul>
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left">
                    <th className="px-3 py-2 text-xs font-medium text-text-muted">
                      Student
                    </th>
                    <th className="px-3 py-2 text-xs font-medium text-text-muted">
                      Awards this period
                    </th>
                    <th className="w-36 px-3 py-2 text-xs font-medium text-text-muted">
                      <span className="sr-only">Add award</span>
                    </th>
                  </tr>
                </thead>
                <motion.tbody
                  variants={staggerList}
                  initial="hidden"
                  animate="show"
                >
                  {visibleListed.map((student) => (
                    <motion.tr
                      key={student.id}
                      variants={staggerItemOpacity}
                      className="group border-b border-border-subtle"
                    >
                      <td className="px-3 py-2 align-middle font-medium text-text-primary">
                        {student.name}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <AnimatePresence initial={false}>
                            {student.grants.map((grant) => (
                              <GrantChip
                                key={grant.id}
                                grant={grant}
                                reduced={reduced}
                                onDelete={() => requestDelete(student, grant)}
                                onPromote={() =>
                                  promoteMutation.mutate(grant.title.id)
                                }
                                onDownload={
                                  grant.title.display_template
                                    ? () => void downloadGrant(student, grant)
                                    : undefined
                                }
                              />
                            ))}
                          </AnimatePresence>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={ADD_AWARD_BUTTON_CLASS}
                          onClick={() => openComposer([student.id])}
                        >
                          Add award
                        </Button>
                      </td>
                    </motion.tr>
                  ))}
                </motion.tbody>
              </table>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <Dialog.Root
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.Title>Remove {pendingDelete?.titleName}?</Dialog.Title>
            <Dialog.Description>
              {pendingDelete?.studentName} will no longer have this award for
              this period.
            </Dialog.Description>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPendingDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={deleteMutation.isLoading}
                isLoading={deleteMutation.isLoading}
                onClick={confirmDelete}
              >
                Remove
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <FullScreenImageViewer
        imageUrl={preview?.url ?? null}
        title={preview?.title ?? "Award"}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
