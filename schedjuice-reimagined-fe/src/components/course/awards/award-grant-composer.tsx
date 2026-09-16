"use client";

import { getAwardDisplayTemplate } from "@/lib/awards-api";
import { awardDocumentFromTemplate } from "@/lib/awards/award-document";
import { resolveTitlePick } from "@/lib/awards/resolve-title-pick";
import { bindAwardPreview } from "@/lib/image-template/bind-award-preview";
import { composite } from "@/lib/image-template/composite";
import { comboboxInputGroupClassName } from "@/lib/ui/control-sizing";
import { useDropdownPositionerClassName } from "@/lib/ui/modal-overlay-context";
import {
  comboboxPopupWidthClassName,
  selectPopupMaxHeightClassName,
} from "@/lib/ui/select-layout";
import { cn } from "@/lib/utils";
import { crossfadeInstant, revealBar } from "@/lib/sj/motion";
import type {
  AwardBoardStudent,
  AwardDisplayTemplate,
  AwardPickerGroups,
  AwardTitleSummary,
} from "@/types/award";
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { AxiosError } from "axios";
import { Check, NavArrowDown, NavArrowLeft, NavArrowRight, Xmark } from "iconoir-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fetchCourseMainTeacher } from "@/lib/awards/course-main-teacher";
import { fetchUserImageUrls } from "@/app/client-api/user-images";
import { SearchField } from "@/components/form/search-field";
import { ImageShimmer } from "@/components/misc/image-shimmer";
import { Button, Checkbox } from "@/components/primitives";
import {
  restoreMainContentViewportAnchor,
  scrollElementToViewportRatio,
  AWARD_GRANT_TITLE_VIEWPORT_RATIO,
} from "@/lib/main-content-scroll";

const RECORDED_ONLY_COPY = "This grant is recorded only. No certificate image.";

function previewCacheKey(
  titleId: number,
  studentId: number | null,
  mtSignatureUrl: string | null,
) {
  return `${titleId}:${studentId ?? 0}:${mtSignatureUrl ?? ""}`;
}

export type AwardGrantResult = {
  granted: Array<{ id: number; user: number; title: { id: number; name: string } }>;
  errors: Array<{ user: number; message: string }>;
};

export type AwardGrantComposerProps = {
  open: boolean;
  courseId: number | string;
  courseName?: string;
  periodLabel: string;
  students: AwardBoardStudent[];
  picker: AwardPickerGroups;
  orgTitles: AwardTitleSummary[];
  localTitles: AwardTitleSummary[];
  precheckedIds: number[];
  pending: boolean;
  onCancel: () => void;
  onGrant: (input: {
    title_id?: number | null;
    name?: string | null;
    user_ids: number[];
  }) => Promise<AwardGrantResult>;
};

type TitleComboItem =
  | { kind: "title"; id: number; name: string; title: AwardTitleSummary }
  | { kind: "create"; id: "create"; name: string };

type TitleComboGroup = { value: string; items: TitleComboItem[] };

const COMBO_ITEM_CLASS =
  "grid cursor-default grid-cols-[1.25rem_1fr] items-center gap-2 px-2 py-2 text-base outline-none select-none " +
  "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground";

function titleErrorMessage(err: unknown): string {
  const details = (err as AxiosError<{ details?: unknown }>)?.response?.data
    ?.details;
  if (typeof details === "string" && details.trim()) return details.trim();
  if (details && typeof details === "object") {
    const record = details as Record<string, unknown>;
    for (const key of ["title", "name", "user_ids", "period_kind"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    }
  }
  return "Could not grant this award.";
}

function studentHasTitle(
  student: AwardBoardStudent,
  title: AwardTitleSummary | null,
  query: string,
): boolean {
  if (title) {
    return student.grants.some((grant) => grant.title.id === title.id);
  }
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  return student.grants.some(
    (grant) => grant.title.name.trim().toLowerCase() === needle,
  );
}

function AwardTitleCombobox({
  id,
  query,
  selectedTitle,
  groups,
  exactKnown,
  disabled,
  onQueryChange,
  onPickTitle,
}: {
  id: string;
  query: string;
  selectedTitle: AwardTitleSummary | null;
  groups: Array<{ label: string; titles: AwardTitleSummary[] }>;
  exactKnown: boolean;
  disabled: boolean;
  onQueryChange: (value: string) => void;
  onPickTitle: (title: AwardTitleSummary) => void;
}) {
  const positionerClassName = useDropdownPositionerClassName();
  const trimmed = query.trim();
  const comboGroups = useMemo((): TitleComboGroup[] => {
    const next: TitleComboGroup[] = groups
      .map((group) => ({
        value: group.label,
        items: group.titles.map((title) => ({
          kind: "title" as const,
          id: title.id,
          name: title.name,
          title,
        })),
      }))
      .filter((group) => group.items.length > 0);
    if (trimmed && !exactKnown) {
      next.push({
        value: "",
        items: [{ kind: "create", id: "create", name: trimmed }],
      });
    }
    return next;
  }, [groups, trimmed, exactKnown]);

  const selectedItem: TitleComboItem | null = selectedTitle
    ? {
        kind: "title",
        id: selectedTitle.id,
        name: selectedTitle.name,
        title: selectedTitle,
      }
    : trimmed && !exactKnown
      ? { kind: "create", id: "create", name: trimmed }
      : null;

  return (
    <BaseCombobox.Root<TitleComboItem>
      items={comboGroups}
      disabled={disabled}
      modal={false}
      inputValue={query}
      value={selectedItem}
      onInputValueChange={(value) => onQueryChange(String(value))}
      onValueChange={(item) => {
        if (item == null) {
          onQueryChange("");
          return;
        }
        if (item.kind === "create") {
          onQueryChange(item.name);
          return;
        }
        onPickTitle(item.title);
      }}
      itemToStringLabel={(item) => item.name}
      isItemEqualToValue={(a, b) => a.kind === b.kind && a.id === b.id}
    >
      <BaseCombobox.InputGroup
        className={comboboxInputGroupClassName("full")}
      >
        <BaseCombobox.Input
          id={id}
          placeholder="Search or create a title"
          autoComplete="off"
          aria-label="Award title"
          className="h-full w-full rounded-md bg-transparent pr-16 pl-3 text-base text-text-primary outline-none placeholder:text-text-muted"
        />
        <div className="absolute right-0 flex h-full items-center text-text-muted">
          <BaseCombobox.Clear
            className="flex h-full w-8 items-center justify-center"
            aria-label="Clear"
          >
            <Xmark width={16} height={16} aria-hidden />
          </BaseCombobox.Clear>
          <BaseCombobox.Trigger
            className="flex h-full w-8 items-center justify-center"
            aria-label="Open"
          >
            <NavArrowDown width={16} height={16} aria-hidden />
          </BaseCombobox.Trigger>
        </div>
      </BaseCombobox.InputGroup>
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner className={positionerClassName} sideOffset={4}>
          <BaseCombobox.Popup
            className={cn(
              comboboxPopupWidthClassName(),
              "rounded-md border border-border bg-surface-elevated text-text-primary shadow-md",
              "outline-none focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--ring)]",
            )}
          >
            <BaseCombobox.Empty className="px-3 py-3 text-sm text-text-muted [&:empty]:hidden">
              No matching titles.
            </BaseCombobox.Empty>
            <BaseCombobox.List
              className={cn(
                selectPopupMaxHeightClassName(),
                "py-1 data-empty:p-0",
              )}
            >
              {(group: TitleComboGroup) => (
                <BaseCombobox.Group
                  key={group.value || "create"}
                  items={group.items}
                >
                  {group.value ? (
                    <BaseCombobox.GroupLabel className="px-2 py-1 text-xs font-medium text-text-muted">
                      {group.value}
                    </BaseCombobox.GroupLabel>
                  ) : null}
                  <BaseCombobox.Collection>
                    {(item: TitleComboItem) => (
                      <BaseCombobox.Item
                        key={`${item.kind}-${item.id}`}
                        value={item}
                        className={COMBO_ITEM_CLASS}
                      >
                        <BaseCombobox.ItemIndicator className="col-start-1">
                          <Check width={16} height={16} aria-hidden />
                        </BaseCombobox.ItemIndicator>
                        <span className="col-start-2">
                          {item.kind === "create"
                            ? `Create “${item.name}”`
                            : item.name}
                        </span>
                      </BaseCombobox.Item>
                    )}
                  </BaseCombobox.Collection>
                </BaseCombobox.Group>
              )}
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  );
}

export function AwardGrantComposer({
  open,
  courseId,
  courseName = "",
  periodLabel,
  students,
  picker,
  orgTitles,
  localTitles,
  precheckedIds,
  pending,
  onCancel,
  onGrant,
}: AwardGrantComposerProps) {
  const reduced = useReducedMotion();
  const barVariants = reduced ? crossfadeInstant : revealBar;
  const [query, setQuery] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [previewUserId, setPreviewUserId] = useState<number | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<AwardTitleSummary | null>(
    null,
  );
  const [checkedIds, setCheckedIds] = useState<Set<number>>(
    () => new Set(precheckedIds),
  );
  const [grantedIds, setGrantedIds] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [titleError, setTitleError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewUrlKey, setPreviewUrlKey] = useState("");
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  const [mtName, setMtName] = useState("");
  const [mtSignatureUrl, setMtSignatureUrl] = useState<string | null>(null);
  const [mtReady, setMtReady] = useState(false);
  const templateCacheRef = useRef(
    new Map<string, AwardDisplayTemplate | null>(),
  );
  const photoUrlsRef = useRef<Record<string, string | null>>({});
  const previewCacheRef = useRef(new Map<string, string>());
  const rootRef = useRef<HTMLDivElement>(null);
  const expandedAnchorTopRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (open) {
      if (rootRef.current) {
        expandedAnchorTopRef.current =
          rootRef.current.getBoundingClientRect().top;
      }
      return;
    }
    if (expandedAnchorTopRef.current == null || !rootRef.current) return;
    restoreMainContentViewportAnchor(
      expandedAnchorTopRef.current,
      rootRef.current,
    );
    expandedAnchorTopRef.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const titleEl = document.getElementById("award-grant-title");
        if (titleEl) {
          scrollElementToViewportRatio(titleEl, {
            targetRatio: AWARD_GRANT_TITLE_VIEWPORT_RATIO,
            relativeToContainer: true,
          });
        }
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setStudentQuery("");
    setPreviewUserId(null);
    setSelectedTitle(null);
    setCheckedIds(new Set(precheckedIds));
    setGrantedIds(new Set());
    setErrors({});
    setTitleError("");
    setSubmitting(false);
    setPreviewUrl(null);
    setPreviewUrlKey("");
    setPreviewUnavailable(false);
    templateCacheRef.current.clear();
    photoUrlsRef.current = {};
    previewCacheRef.current.clear();
  }, [open, precheckedIds]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMtReady(false);
    void fetchCourseMainTeacher(courseId)
      .then((mt) => {
        if (cancelled) return;
        setMtName(mt.name);
        setMtSignatureUrl(mt.signatureUrl);
        setMtReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setMtName("");
        setMtSignatureUrl(null);
        setMtReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, courseId]);

  const groups = useMemo(
    () => [
      { label: "Pinned", titles: picker.pinned },
      { label: "Popular", titles: picker.top10 },
      { label: "This course", titles: picker.local },
      { label: "Other", titles: picker.other },
    ],
    [picker],
  );

  const exactKnown =
    orgTitles.some(
      (title) => title.name.toLowerCase() === query.trim().toLowerCase(),
    ) ||
    localTitles.some(
      (title) => title.name.toLowerCase() === query.trim().toLowerCase(),
    );

  const titleHeld = (student: AwardBoardStudent) =>
    studentHasTitle(student, selectedTitle, query);

  const enabledUserIds = students
    .filter(
      (student) =>
        checkedIds.has(student.id) &&
        !titleHeld(student) &&
        !grantedIds.has(student.id),
    )
    .map((student) => student.id);

  const hasTitle = selectedTitle != null || query.trim().length > 0;
  const canGrant = hasTitle && enabledUserIds.length > 0;
  const busy = pending || submitting;

  const studentNeedle = studentQuery.trim().toLowerCase();
  const visibleStudents = studentNeedle
    ? students.filter((student) =>
        student.name.toLowerCase().includes(studentNeedle),
      )
    : students;

  const previewableStudents = students.filter(
    (student) =>
      checkedIds.has(student.id) &&
      !titleHeld(student) &&
      !grantedIds.has(student.id),
  );
  const previewStudent =
    previewableStudents.find((student) => student.id === previewUserId) ??
    previewableStudents[0] ??
    null;
  const previewName = previewStudent?.name ?? "Student";
  const previewTitleName = selectedTitle?.name || query.trim();
  const wantsTemplate = Boolean(selectedTitle?.has_display_template);
  const canCyclePreview = wantsTemplate && previewableStudents.length > 1;
  const previewableIdsKey = previewableStudents.map((student) => student.id).join(",");
  const currentPreviewKey =
    selectedTitle != null
      ? previewCacheKey(
          selectedTitle.id,
          previewStudent?.id ?? null,
          mtSignatureUrl,
        )
      : "";
  const cachedPreviewUrl = currentPreviewKey
    ? (previewCacheRef.current.get(currentPreviewKey) ?? null)
    : null;
  const previewIsCurrent = Boolean(
    cachedPreviewUrl || (previewUrl && previewUrlKey === currentPreviewKey),
  );
  const stalePreviewUrl =
    Boolean(previewUrl) &&
    selectedTitle != null &&
    previewUrlKey.startsWith(`${selectedTitle.id}:`)
      ? previewUrl
      : null;
  const shownPreviewUrl = cachedPreviewUrl ?? (previewIsCurrent ? previewUrl : stalePreviewUrl);
  const previewLoading =
    Boolean(wantsTemplate && !previewIsCurrent && !previewUnavailable);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (!wantsTemplate || selectedTitle == null) {
      setPreviewUrl(null);
      setPreviewUrlKey("");
      setPreviewUnavailable(false);
      return () => {
        cancelled = true;
      };
    }
    if (!mtReady) return;
    const cacheKey = previewCacheKey(
      selectedTitle.id,
      previewStudent?.id ?? null,
      mtSignatureUrl,
    );
    const cached = previewCacheRef.current.get(cacheKey);
    if (cached) {
      setPreviewUrl(cached);
      setPreviewUrlKey(cacheKey);
      setPreviewUnavailable(false);
      return () => {
        cancelled = true;
      };
    }
    setPreviewUnavailable(false);
    const previewableIds = previewableIdsKey
      ? previewableIdsKey.split(",").map(Number)
      : [];
    void (async () => {
      try {
        const templateKey = `${courseId}:${selectedTitle.id}`;
        let template: AwardDisplayTemplate | null;
        if (templateCacheRef.current.has(templateKey)) {
          template = templateCacheRef.current.get(templateKey) ?? null;
        } else {
          template = await getAwardDisplayTemplate(courseId, selectedTitle.id);
          if (cancelled) return;
          templateCacheRef.current.set(templateKey, template);
        }
        if (!template) {
          setPreviewUrl(null);
          setPreviewUrlKey("");
          setPreviewUnavailable(true);
          return;
        }
        const missing = previewableIds.filter(
          (id) => !(String(id) in photoUrlsRef.current),
        );
        if (missing.length > 0) {
          try {
            const photos = await fetchUserImageUrls(missing, "award_image");
            if (cancelled) return;
            for (const id of missing) {
              photoUrlsRef.current[String(id)] =
                photos.urls[String(id)] ?? null;
            }
          } catch {
            if (cancelled) return;
            for (const id of missing) {
              photoUrlsRef.current[String(id)] = null;
            }
          }
        }
        const awardImageUrl = previewStudent
          ? (photoUrlsRef.current[String(previewStudent.id)] ?? null)
          : null;
        const canvas = await composite(
          awardDocumentFromTemplate(template),
          bindAwardPreview({
            studentName: previewName,
            courseName,
            awardTitle: previewTitleName,
            awardImageUrl,
            mtName,
            mtSignatureUrl,
          }),
        );
        if (cancelled) return;
        const url = canvas.toDataURL("image/png");
        previewCacheRef.current.set(cacheKey, url);
        setPreviewUrl(url);
        setPreviewUrlKey(cacheKey);
        setPreviewUnavailable(false);
      } catch {
        if (cancelled) return;
        setPreviewUrl(null);
        setPreviewUrlKey("");
        setPreviewUnavailable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    wantsTemplate,
    selectedTitle,
    courseId,
    previewName,
    previewStudent?.id,
    previewableIdsKey,
    courseName,
    previewTitleName,
    mtReady,
    mtName,
    mtSignatureUrl,
  ]);

  const pickTitle = (title: AwardTitleSummary) => {
    setSelectedTitle(title);
    setQuery(title.name);
    setTitleError("");
    setPreviewUnavailable(false);
  };

  const onQueryChange = (value: string) => {
    setQuery(value);
    setTitleError("");
    const pick = resolveTitlePick(value, orgTitles, localTitles);
    if (pick.kind === "create") {
      setSelectedTitle(null);
      return;
    }
    const match =
      orgTitles.find((title) => title.id === pick.titleId) ??
      localTitles.find((title) => title.id === pick.titleId) ??
      null;
    setSelectedTitle(match);
    setPreviewUnavailable(false);
  };

  const movePreview = (delta: number) => {
    if (previewableStudents.length < 2) return;
    const current = Math.max(
      0,
      previewableStudents.findIndex(
        (student) => student.id === previewStudent?.id,
      ),
    );
    const next =
      previewableStudents[
        (current + delta + previewableStudents.length) %
          previewableStudents.length
      ];
    if (next) setPreviewUserId(next.id);
  };

  const toggleStudent = (id: number, checked: boolean) => {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const submit = async () => {
    if (!canGrant || busy) return;
    setSubmitting(true);
    setTitleError("");
    const pick = selectedTitle
      ? { title_id: selectedTitle.id as number | null, name: undefined as string | undefined }
      : (() => {
          const resolved = resolveTitlePick(query, orgTitles, localTitles);
          if (resolved.kind === "create") {
            return { title_id: null, name: resolved.name };
          }
          return { title_id: resolved.titleId, name: undefined };
        })();
    try {
      const result = await onGrant({
        title_id: pick.title_id,
        name: pick.name,
        user_ids: enabledUserIds,
      });
      setErrors((current) => {
        const next = { ...current };
        for (const id of enabledUserIds) delete next[id];
        for (const row of result.errors) next[row.user] = row.message;
        return next;
      });
      if (result.granted.length > 0) {
        setGrantedIds((current) => {
          const next = new Set(current);
          for (const row of result.granted) next.add(row.user);
          return next;
        });
        setCheckedIds((current) => {
          const next = new Set(current);
          for (const row of result.granted) next.delete(row.user);
          return next;
        });
      }
    } catch (err) {
      setTitleError(titleErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className="min-h-0"
      style={{ minHeight: open ? undefined : 0 }}
    >
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="award-grant-composer"
            variants={barVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="overflow-hidden motion-reduce:transition-none"
          >
            <div className="space-y-4 rounded-lg border border-border bg-surface-sunken/40 p-4">
              <p className="text-sm font-medium text-text-primary">
                Grant · {periodLabel}
              </p>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="award-grant-title"
                      className="text-sm font-medium text-text-primary"
                    >
                      Award title
                    </label>
                    <AwardTitleCombobox
                      id="award-grant-title"
                      query={query}
                      selectedTitle={selectedTitle}
                      groups={groups}
                      exactKnown={exactKnown}
                      disabled={busy}
                      onQueryChange={onQueryChange}
                      onPickTitle={pickTitle}
                    />
                    <div className="min-h-5 text-sm text-danger">{titleError}</div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-text-primary">
                      Students
                    </p>
                    <SearchField
                      placeholder="Search students"
                      value={studentQuery}
                      onChange={(event) => setStudentQuery(event.target.value)}
                      disabled={busy}
                    />
                    {visibleStudents.length === 0 ? (
                      <p className="text-sm text-text-muted">
                        No matching students.
                      </p>
                    ) : (
                      <ul className="max-h-[min(20rem,45vh)] space-y-1 overflow-y-auto">
                        {visibleStudents.map((student) => {
                          const held = titleHeld(student);
                          const sessionGranted = grantedIds.has(student.id);
                          const locked = held || sessionGranted;
                          const checked =
                            held ||
                            (!sessionGranted && checkedIds.has(student.id));
                          return (
                            <li key={student.id} className="space-y-0.5">
                              <label className="flex items-center gap-2 text-sm text-text-primary">
                                <Checkbox
                                  id={`award-grant-student-${student.id}`}
                                  checked={checked}
                                  disabled={locked || busy}
                                  onCheckedChange={(value) =>
                                    toggleStudent(student.id, value === true)
                                  }
                                />
                                {student.name}
                                {held ? (
                                  <span className="text-text-muted">
                                    Already granted
                                  </span>
                                ) : null}
                              </label>
                              <p className="min-h-5 pl-7 text-sm text-danger">
                                {errors[student.id] ?? ""}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-text-primary">Preview</p>
                  <div
                    data-slot="award-grant-preview"
                    className="relative h-72 w-full min-w-0 overflow-hidden rounded-md border border-border bg-surface contain-size lg:h-112"
                    aria-busy={previewLoading ? true : undefined}
                  >
                    {shownPreviewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={shownPreviewUrl}
                        alt={
                          previewIsCurrent && previewStudent
                            ? `Award preview for ${previewStudent.name}`
                            : "Award preview"
                        }
                        className="absolute inset-0 m-auto h-full w-full object-contain p-4"
                      />
                    ) : previewLoading ? null : (
                      <p className="absolute inset-0 flex items-center justify-center px-3 text-center text-sm text-text-muted">
                        {RECORDED_ONLY_COPY}
                      </p>
                    )}
                    {previewLoading ? (
                      <ImageShimmer
                        className={
                          shownPreviewUrl
                            ? "pointer-events-none absolute inset-0 bg-surface/50"
                            : "absolute inset-0"
                        }
                      />
                    ) : null}
                  </div>
                  {wantsTemplate ? (
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label="Previous student"
                        onClick={() => movePreview(-1)}
                        disabled={!canCyclePreview || busy}
                        className="shrink-0 px-2"
                      >
                        <NavArrowLeft width={18} height={18} aria-hidden />
                      </Button>
                      <p className="min-w-0 truncate text-center text-sm text-text-muted">
                        {previewStudent?.name ?? "Preview"}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label="Next student"
                        onClick={() => movePreview(1)}
                        disabled={!canCyclePreview || busy}
                        className="shrink-0 px-2"
                      >
                        <NavArrowRight width={18} height={18} aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onCancel}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void submit()}
                  disabled={!canGrant || busy}
                  isLoading={busy}
                >
                  Grant
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
