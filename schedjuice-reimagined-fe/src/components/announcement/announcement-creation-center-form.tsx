"use client";

import {
  Button,
  Checkbox,
  Input,
  Select,
  buttonVariants,
  useToast,
} from "@/components/primitives";
import { Field } from "@/components/primitives/field";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { makePostRequest, searchEntities } from "@/app/client-api/utils";
import { setFormErrrors } from "@/helpers/form";
import { useEditor } from "@tiptap/react";
import { getAnnouncementEditorOptions } from "../editor/config";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Xmark } from "iconoir-react";
import { queryClient } from "@/lib/query";
import { useUser } from "@/hooks/useUser";
import { useTenant } from "@/hooks/useTenant";
import { attachmentType } from "@/types/attachment";
import TextEditor from "../editor/editor";
import AttachmentUploader from "../attachment-uploader/attachment-uploader";
import {
  createTipTapImagePasteHandler,
  useAttachmentDropzone,
} from "../attachment-uploader/use-attachment-dropzone";
import MultiSelectPopOver, { entityType } from "../form/multi-select-popover";
import EntityCombobox from "../form/entity-combobox";
import GenericDialog from "../misc/generic-dialog";
import { ToggleGroup, ToggleGroupItem } from "../misc/toggle-group";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  AnnouncementCenterScope,
  type AnnouncementCourseFilters,
} from "@/types/announcement-center";
import {
  getBatchCreateToastMessage,
  parseAnnouncementBatchCreateResult,
} from "@/helpers/announcement-batch-create";
import { buildAnnouncementCenterFormData } from "@/helpers/announcement-center-form-data";
import { operatorEnum } from "@/types/api";
import {
  COURSE_START_TIMING_LABEL_EARLY,
  COURSE_START_TIMING_LABEL_LATER,
} from "@/helpers/date";
import { crossfade, crossfadeInstant } from "@/lib/sj/motion";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const MONTH_TYPES = ["ALL", "FM", "HM"] as const;
type MonthType = (typeof MONTH_TYPES)[number];

const MONTH_TYPE_LABELS: Record<MonthType, string> = {
  ALL: "All courses",
  FM: `${COURSE_START_TIMING_LABEL_EARLY} only`,
  HM: `${COURSE_START_TIMING_LABEL_LATER} only`,
};

const schema = z.object({
  title: z.string().min(1),
  month_type: z.enum(MONTH_TYPES),
});

type FormValues = z.infer<typeof schema>;

type SelectedCourse = {
  id: number;
  title: string;
};

export type AnnouncementCreationCenterFormProps = {
  cancelHref?: string;
  onCancel?: () => void;
  onSuccess?: () => void;
};

export function AnnouncementCreationCenterForm({
  cancelHref,
  onCancel,
  onSuccess,
}: AnnouncementCreationCenterFormProps) {
  const reducedMotion = useReducedMotion();
  const scopeToggleId = useId();
  const sendToTeamsCheckboxId = useId();
  const { user } = useUser();
  const { tenant } = useTenant();
  const toast = useToast();
  const microsoftOn = Boolean(tenant?.is_microsoft_on);

  const [scope, setScope] = useState(AnnouncementCenterScope.OrgWide);
  const [selectedCourses, setSelectedCourses] = useState<SelectedCourse[]>([]);
  const [coursePickerValue, setCoursePickerValue] = useState("");
  const [attachments, setAttachments] = useState<(attachmentType | File)[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<entityType[]>([]);
  const [sendToMicrosoft, setSendToMicrosoft] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<FormValues | null>(null);

  const editor = useEditor(
    getAnnouncementEditorOptions({ teamsSafe: microsoftOn }),
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", month_type: "ALL" },
  });

  const dropzone = useAttachmentDropzone({
    attachments,
    setAttachments,
    maxFiles: 10,
    isImageOnly: true,
  });

  const handleEditorPaste = useCallback(
    createTipTapImagePasteHandler(dropzone.onPaste),
    [dropzone.onPaste],
  );

  useEffect(() => {
    if (!editor) return;
    const existingDomEvents = editor.options.editorProps?.handleDOMEvents ?? {};
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        handleDOMEvents: {
          ...existingDomEvents,
          paste: handleEditorPaste,
        },
      },
    });
  }, [editor, handleEditorPaste]);

  const { data: categoriesData } = useQuery({
    queryKey: ["searchCategories", "announcement-creation-center"],
    queryFn: () =>
      searchEntities("categories", {
        size: -1,
        fields: ["id", "name"],
        sorts: ["name"],
      }),
    enabled: microsoftOn && scope === AnnouncementCenterScope.OrgWide,
  });

  const categories = categoriesData?.data?.data ?? [];

  const courseExcludeParams = useMemo(
    () =>
      selectedCourses.length > 0
        ? [
            {
              field_name: "id",
              operator: operatorEnum.in,
              value: selectedCourses.map((course) => course.id).join(","),
            },
          ]
        : [],
    [selectedCourses],
  );

  const addSelectedCourse = useCallback((course: { id: number; title: string }) => {
    setSelectedCourses((prev) => {
      if (prev.some((item) => item.id === course.id)) {
        return prev;
      }
      return [...prev, { id: course.id, title: course.title }];
    });
  }, []);

  const removeSelectedCourse = useCallback((courseId: number) => {
    setSelectedCourses((prev) => prev.filter((course) => course.id !== courseId));
  }, []);

  const createMutation = useMutation({
    mutationKey: ["createAnnouncementCenter", scope],
    mutationFn: ({
      formData,
      endpoint,
    }: {
      formData: FormData;
      endpoint: "announcements" | "announcements/batch";
    }) => makePostRequest(endpoint, formData, {}, {}),
    onSuccess: (response) => {
      if (scope === AnnouncementCenterScope.PerCourse) {
        const { created, failed } = parseAnnouncementBatchCreateResult(response);
        const toastMessage = getBatchCreateToastMessage(
          created.length,
          failed.length,
        );
        toast.add({
          type: toastMessage.type,
          description: toastMessage.description,
        });
        queryClient.invalidateQueries({ queryKey: ["announcementList"] });
        for (const row of created) {
          queryClient.invalidateQueries({
            queryKey: ["announcementList", row.course_id],
          });
          queryClient.invalidateQueries({
            queryKey: ["courseFeed", row.course_id],
          });
        }
        if (created.length === 0) {
          return;
        }
        onSuccess?.();
        return;
      }

      toast.add({
        description:
          scope === AnnouncementCenterScope.OrgWide && sendToMicrosoft
            ? "Announcement created and sent to MS Teams"
            : "Announcement created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["announcementList"] });
      onSuccess?.();
    },
    onError: (e) => {
      setFormErrrors(e, form);
      toast.add({
        type: "error",
        title: "Error",
        description: "Could not create announcement.",
      });
    },
  });

  const buildCourseFilters = (
    data: FormValues,
  ): AnnouncementCourseFilters | undefined => {
    if (
      scope !== AnnouncementCenterScope.OrgWide ||
      !microsoftOn ||
      !sendToMicrosoft
    ) {
      return undefined;
    }
    const courseFilters: AnnouncementCourseFilters = {
      month_type: data.month_type,
    };
    if (selectedCategories.length > 0) {
      courseFilters.category_ids = selectedCategories.map((e) => Number(e.id));
    }
    return courseFilters;
  };

  const doSubmit = (data: FormValues) => {
    const filesToUpload = attachments.filter((a): a is File => a instanceof File);
    const formData = buildAnnouncementCenterFormData({
      scope,
      title: data.title,
      dataHtml: editor?.getHTML() ?? "",
      createdById: user?.id,
      files: filesToUpload,
      courseIds:
        scope === AnnouncementCenterScope.PerCourse
          ? selectedCourses.map((course) => course.id)
          : undefined,
      sendToMicrosoft:
        microsoftOn && sendToMicrosoft ? true : undefined,
      courseFilters: buildCourseFilters(data),
    });

    createMutation.mutate({
      formData,
      endpoint:
        scope === AnnouncementCenterScope.PerCourse
          ? "announcements/batch"
          : "announcements",
    });
    setConfirmOpen(false);
    setPendingSubmit(null);
  };

  const onSubmit = (data: FormValues) => {
    if (
      scope === AnnouncementCenterScope.PerCourse &&
      selectedCourses.length === 0
    ) {
      toast.add({
        type: "error",
        description:
          "Select at least one course before creating the announcement.",
      });
      return;
    }

    if (
      scope === AnnouncementCenterScope.OrgWide &&
      microsoftOn &&
      sendToMicrosoft
    ) {
      setPendingSubmit(data);
      setConfirmOpen(true);
      return;
    }

    doSubmit(data);
  };

  const categoryNames =
    selectedCategories.length > 0
      ? selectedCategories
          .map((c) => (c as { name?: string }).name ?? c.id)
          .join(", ")
      : "All categories";

  const isSaving = createMutation.isPending;
  const submitLabel =
    scope === AnnouncementCenterScope.OrgWide && microsoftOn && sendToMicrosoft
      ? "Create & send to MS Teams"
      : "Create announcement";

  return (
    <div className="rounded-xl border border-border/60 bg-surface p-6">
      <div {...form}>
        <form
          {...dropzone.getRootProps({
            className: cn(
              dropzone.isDragActive &&
                "rounded-lg ring-2 ring-primary/30 bg-muted/20",
            ),
            onSubmit: form.handleSubmit(onSubmit),
            onPaste: (e) => dropzone.onPaste(e.nativeEvent),
          })}
        >
          <input
            {...dropzone.getInputProps()}
            accept="image/*"
            className="sr-only"
          />
          <h2>Create announcement</h2>

          <fieldset disabled={isSaving} className="min-w-0 border-0 p-0 m-0">
            <div className="mt-4 space-y-2">
              <span
                id={`${scopeToggleId}-label`}
                className="text-sm text-muted-foreground"
              >
                Scope
              </span>
              <ToggleGroup
                type="single"
                value={scope}
                onValueChange={(value) => {
                  if (!value) return;
                  setScope(value as AnnouncementCenterScope);
                  if (value === AnnouncementCenterScope.OrgWide) {
                    setSelectedCourses([]);
                    setCoursePickerValue("");
                  }
                }}
                className="justify-start"
                aria-labelledby={`${scopeToggleId}-label`}
              >
                <ToggleGroupItem
                  value={AnnouncementCenterScope.OrgWide}
                  aria-label="Org-wide"
                >
                  Org-wide
                </ToggleGroupItem>
                <ToggleGroupItem
                  value={AnnouncementCenterScope.PerCourse}
                  aria-label="Per course"
                >
                  Per course
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {scope === AnnouncementCenterScope.PerCourse ? (
                <motion.div
                  key="per-course"
                  variants={reducedMotion ? crossfadeInstant : crossfade}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="mt-4 max-w-md"
                >
                  <div className="space-y-2">
                    <span className="text-sm text-muted-foreground">Courses</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedCourses.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          None selected yet.
                        </p>
                      ) : (
                        selectedCourses.map((course) => (
                          <span
                            key={course.id}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-1 text-xs text-foreground"
                          >
                            <span className="max-w-40 truncate">
                              {course.title}
                            </span>
                            <button
                              type="button"
                              aria-label={`Remove ${course.title}`}
                              disabled={isSaving}
                              className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                              onClick={() => removeSelectedCourse(course.id)}
                            >
                              <Xmark className="size-3" aria-hidden />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                    <EntityCombobox
                      entity="courses"
                      label="Courses"
                      hideLabel
                      value={coursePickerValue}
                      onChange={setCoursePickerValue}
                      onSelectedEntityChange={(course) => {
                        if (course?.id == null || !course.title) {
                          return;
                        }
                        addSelectedCourse({
                          id: Number(course.id),
                          title: String(course.title),
                        });
                        setCoursePickerValue("");
                      }}
                      comboboxPlaceholder="Search courses"
                      displayFunction={(course) => course.title}
                      filterParams={{
                        exclude_params: courseExcludeParams,
                      }}
                      queryParams={{
                        fields: ["id", "title"],
                        sorts: ["title"],
                        size: 20,
                      }}
                    />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <Controller
              control={form.control}
              name="title"
              render={({ field }) => (
                <div className="mt-4">
                  <Input
                    {...field}
                    required
                    placeholder="Announcement Title"
                    className="border-none bg-transparent shadow-none focus:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none text-xl"
                  />
                </div>
              )}
            />

            {editor ? (
              <div className="mt-2">
                <TextEditor
                  editor={editor}
                  isViewOnly={false}
                  menuProps={{
                    teamsSafe: microsoftOn,
                    variant: "full",
                  }}
                />
              </div>
            ) : null}

            {scope === AnnouncementCenterScope.OrgWide && microsoftOn ? (
              <div className="mt-4 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Controller
                    control={form.control}
                    name="month_type"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        items={[
                          { value: "ALL", label: "All courses" },
                          {
                            value: "FM",
                            label: `${COURSE_START_TIMING_LABEL_EARLY} only`,
                          },
                          {
                            value: "HM",
                            label: `${COURSE_START_TIMING_LABEL_LATER} only`,
                          },
                        ]}
                      />
                    )}
                  />
                  <div className="flex items-center gap-2">
                    <MultiSelectPopOver
                      label="Filter by category"
                      entities={categories}
                      selectedEntities={selectedCategories}
                      setSelectedEntities={setSelectedCategories}
                      displayFunction={(e) => e.name}
                      isAllSelectedDefault={false}
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      (empty = all)
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            {microsoftOn ? (
              <div className="mt-4">
                <Field.Root className="flex flex-row items-center gap-2">
                  <Checkbox
                    id={sendToTeamsCheckboxId}
                    checked={sendToMicrosoft}
                    onCheckedChange={(checked) =>
                      setSendToMicrosoft(checked === true)
                    }
                  />
                  <Field.Label
                    htmlFor={sendToTeamsCheckboxId}
                    className="text-sm text-muted-foreground font-normal cursor-pointer"
                  >
                    Send to MS Teams
                  </Field.Label>
                </Field.Root>
              </div>
            ) : null}

            <div className="mt-6">
              <AttachmentUploader
                isAnnouncement
                entityName="announcement"
                attachments={attachments}
                setAttachments={setAttachments}
                maxFiles={10}
                isImageOnly
                dropzone={dropzone}
              />
            </div>
          </fieldset>

          <div className="mt-6 flex justify-end gap-3">
            {onCancel ? (
              <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
                disabled={isSaving}
              >
                Cancel
              </Button>
            ) : cancelHref ? (
              <Link
                href={cancelHref}
                aria-disabled={isSaving}
                className={cn(
                  buttonVariants({ variant: "secondary" }),
                  isSaving && "pointer-events-none opacity-50",
                )}
              >
                Cancel
              </Link>
            ) : null}
            <Button type="submit" isLoading={isSaving}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>

      <GenericDialog
        title="Confirm send to MS Teams"
        content={
          <div className="space-y-2">
            <p>Please confirm before sending:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>
                <strong>Month type:</strong>{" "}
                {pendingSubmit && MONTH_TYPE_LABELS[pendingSubmit.month_type]}
              </li>
              <li>
                <strong>Categories:</strong> {categoryNames}
              </li>
            </ul>
            <p className="pt-2">Are you sure you want to send?</p>
          </div>
        }
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setPendingSubmit(null);
        }}
        onConfirm={() => pendingSubmit && doSubmit(pendingSubmit)}
        confirmLabel="Send"
        isLoading={createMutation.isPending}
      />
    </div>
  );
}
