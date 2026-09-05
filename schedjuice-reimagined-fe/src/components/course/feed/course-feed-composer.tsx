"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor } from "@tiptap/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp } from "iconoir-react";
import * as z from "zod";

import TextEditor from "@/components/editor/editor";
import { getFeedComposerEditorOptions } from "@/components/editor/config";
import { editorHasTeamsUnsupportedContent } from "@/helpers/announcement-editor-teams";
import AttachmentUploader from "@/components/attachment-uploader/attachment-uploader";
import {
  collectInlineImageNodes,
  countPendingInlineImages,
  insertCourseFeedInlineImage,
  isClipboardImageFile,
  serializeCourseFeedEditorHtml,
} from "@/helpers/course-feed-inline-image-upload";
import {
  computeTeamsBudget,
  formatTeamsBudgetSummary,
} from "@/helpers/teams-inline-image-budget";
import { collectClipboardFiles } from "@/components/attachment-uploader/attachment-dropzone-files";
import { useAttachmentDropzone } from "@/components/attachment-uploader/use-attachment-dropzone";
import {
  isRasterImageFilename,
  NON_IMAGE_ACCEPT_FOR_DROPZONE,
  NON_IMAGE_ACCEPT_INPUT,
} from "@/helpers/file";
import { DailyLessonUnitHeader } from "@/components/course/feed/daily-lesson-unit-header";
import { FeedPostTypeMenu } from "@/components/course/feed/feed-post-type-menu";
import { FeedTitleInput } from "@/components/course/feed/feed-title-input";
import { Button } from "@/components/primitives";
import { Checkbox } from "@/components/primitives";
import { Field } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import { getCourseMicrosoftChannels } from "@/app/client-api/microsoft";
import {
  makePostRequest,
  updateEntityWithFormData,
} from "@/app/client-api/utils";
import { setFormErrrors } from "@/helpers/form";
import {
  buildCourseFeedUpdateFormData,
  type CourseFeedUpdatePayload,
} from "@/helpers/course-feed-update-form-data";
import { shouldPromptMicrosoftTeamsConnect } from "@/helpers/course-feed-teams-connect";
import { queryClient } from "@/lib/query";
import { useUser } from "@/hooks/useUser";
import { useTenant } from "@/hooks/useTenant";
import { usePersonalMicrosoftStatus } from "@/hooks/useMicrosoftOAuth";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { v4 as uuid } from "uuid";
import { scrollElementToViewportRatio } from "@/lib/main-content-scroll";
import type { attachmentType } from "@/types/attachment";
import type { CourseFeedPost, PostType } from "@/types/course-feed";
import { postTypeSchema } from "@/types/course-feed";

const composerSchema = z
  .object({
    post_type: postTypeSchema,
    title: z.string().optional(),
    unit_ineligible: z.boolean(),
    finished_unit: z.preprocess(
      (val) => (val === "" || val === undefined ? undefined : val),
      z.coerce
        .number({ invalid_type_error: "Unit numbers start at 1" })
        .int({ message: "Unit numbers start at 1" })
        .min(1, { message: "Unit numbers start at 1" })
        .optional(),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.post_type === "announcement") {
      if (!data.title?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Title is required",
          path: ["title"],
        });
      }
    }
    if (data.post_type === "daily_lesson" && !data.unit_ineligible) {
      if (!data.finished_unit || data.finished_unit < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter the unit number you covered today",
          path: ["finished_unit"],
        });
      }
    }
  });

type ComposerFormValues = z.infer<typeof composerSchema>;

function defaultUnitIneligible(initialPost?: CourseFeedPost): boolean {
  return (
    initialPost?.post_type === "daily_lesson" &&
    initialPost.finished_unit == null
  );
}

function buildUpdatePayload(
  values: ComposerFormValues,
  htmlContent: string,
  opts: {
    courseId: number;
    postToTeams: boolean;
    teamsSyncEligible: boolean;
    attachments: (attachmentType | File)[];
    deletedAttachmentIds: number[];
  },
): CourseFeedUpdatePayload {
  const payload: CourseFeedUpdatePayload = {
    post_type: values.post_type,
    html_data: htmlContent,
    course: opts.courseId,
    newFiles: opts.attachments.filter((f): f is File => f instanceof File),
    deletedAttachmentIds: opts.deletedAttachmentIds,
  };
  if (opts.teamsSyncEligible) {
    payload.send_to_microsoft = opts.postToTeams;
  }
  if (values.post_type === "announcement") {
    payload.title = values.title;
  } else {
    payload.finished_unit = values.unit_ineligible
      ? null
      : values.finished_unit ?? null;
  }
  return payload;
}

export type CourseFeedComposerProps = {
  courseId: number;
  mode: "create" | "edit";
  initialPost?: CourseFeedPost;
  onCancel: () => void;
  onSuccess: () => void;
  defaultExpanded?: boolean;
  microsoftGroupId?: string | null;
  microsoftChannelId?: string | null;
};

export function CourseFeedComposer({
  courseId,
  mode,
  initialPost,
  onCancel,
  onSuccess,
  defaultExpanded = mode === "edit",
  microsoftGroupId,
  microsoftChannelId,
}: CourseFeedComposerProps) {
  const toast = useToast();
  const { user } = useUser();
  const { tenant } = useTenant();
  const teamsSyncEligible = Boolean(
    tenant?.is_microsoft_on &&
      tenant?.is_teams_creation_enabled !== false &&
      microsoftGroupId,
  );
  const { data: msPersonalStatus } = usePersonalMicrosoftStatus(teamsSyncEligible);
  const msPersonalConnected = Boolean(msPersonalStatus?.connected);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [shouldFocusTitle, setShouldFocusTitle] = useState(false);
  const [attachments, setAttachments] = useState<(attachmentType | File)[]>([]);
  const [pendingInlineImages, setPendingInlineImages] = useState(0);
  const [teamsBudget, setTeamsBudget] = useState(() => computeTeamsBudget([]));
  const initialInlineAttachmentIdsRef = useRef<number[]>([]);
  const [toDeletedAttachmentId, setToDeletedAttachmentId] = useState<number[]>(
    [],
  );
  const [postToTeams, setPostToTeams] = useState(
    () =>
      Boolean(
        teamsSyncEligible &&
          (mode !== "edit" || initialPost?.send_to_microsoft !== false),
      ),
  );
  const { data: channelsResponse, isLoading: channelsLoading } = useQuery({
    queryKey: ["courseMicrosoftChannels", courseId],
    queryFn: () => getCourseMicrosoftChannels(courseId),
    enabled: teamsSyncEligible,
  });
  const channels = channelsResponse?.data?.data ?? [];
  const generalChannelId = useMemo(
    () => channels.find((ch) => ch.displayName === "General")?.id ?? "",
    [channels],
  );
  const targetChannelId = microsoftChannelId || generalChannelId;
  const targetChannelName =
    channels.find((ch) => ch.id === targetChannelId)?.displayName ?? "General";
  const bodyRef = useRef<HTMLDivElement>(null);
  const composerTitleRef = useRef<HTMLDivElement>(null);

  const form = useForm<ComposerFormValues>({
    resolver: zodResolver(composerSchema),
    defaultValues: {
      post_type: initialPost?.post_type ?? "daily_lesson",
      title: initialPost?.title ?? "",
      unit_ineligible: defaultUnitIneligible(initialPost),
      finished_unit: initialPost?.finished_unit ?? undefined,
    },
  });

  const watchedPostType = form.watch("post_type");
  const unitIneligible = form.watch("unit_ineligible");

  const bodyPlaceholder =
    watchedPostType === "daily_lesson"
      ? "What did the class cover?"
      : "Add details…";

  const editor = useEditor(
    useMemo(
      () => getFeedComposerEditorOptions("What did the class cover?", false),
      [],
    ),
  );

  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      extensions: getFeedComposerEditorOptions(bodyPlaceholder, postToTeams)
        .extensions,
    });
  }, [editor, bodyPlaceholder, postToTeams]);

  useEffect(() => {
    if (mode !== "edit" || !initialPost) return;
    setAttachments(
      (initialPost.attachments ?? []).filter(
        (a) => !isRasterImageFilename(a.filename),
      ),
    );
    const html = initialPost.html_data ?? initialPost.data ?? "";
    const ids: number[] = [];
    const re = /data-attachment-id=["'](\d+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) !== null) {
      ids.push(Number(match[1]));
    }
    initialInlineAttachmentIdsRef.current = ids;
  }, [initialPost, mode]);

  useEffect(() => {
    if (!editor) return;
    const syncBudget = () => {
      setTeamsBudget(computeTeamsBudget(collectInlineImageNodes(editor)));
    };
    syncBudget();
    editor.on("update", syncBudget);
    return () => {
      editor.off("update", syncBudget);
    };
  }, [editor]);

  const dropzone = useAttachmentDropzone({
    attachments,
    setAttachments,
    maxFiles: 10,
    isImageOnly: false,
    accept: NON_IMAGE_ACCEPT_FOR_DROPZONE,
  });

  const handleInlineImageUpload = useCallback(
    async (file: File) => {
      if (!editor) return;
      const uploadId = uuid();
      try {
        await insertCourseFeedInlineImage(editor, file, {
          courseId,
          uploadId,
          onPendingDelta: (delta) => {
            setPendingInlineImages((n) => Math.max(0, n + delta));
          },
        });
      } catch {
        toast.add({
          type: "error",
          title: "Image upload failed",
          description: "Try again or pick a different image.",
        });
      }
    },
    [courseId, editor, toast],
  );

  const handleComposerPaste = useCallback(
    (nativeEvent: ClipboardEvent): boolean => {
      const files = collectClipboardFiles(nativeEvent.clipboardData);
      if (files.length === 0) return false;
      const images = files.filter(isClipboardImageFile);
      const nonImages = files.filter((f) => !isClipboardImageFile(f));
      if (images.length > 0) {
        nativeEvent.preventDefault();
        nativeEvent.stopPropagation();
        void Promise.all(images.map((file) => handleInlineImageUpload(file)));
        return true;
      }
      if (nonImages.length > 0) {
        dropzone.onPaste(nativeEvent);
        return true;
      }
      return false;
    },
    [dropzone, handleInlineImageUpload],
  );

  useEffect(() => {
    if (!editor) return;
    const existingDomEvents = editor.options.editorProps?.handleDOMEvents ?? {};
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        handleDOMEvents: {
          ...existingDomEvents,
          paste: (_view, event) => handleComposerPaste(event),
        },
      },
    });
  }, [editor, handleComposerPaste]);

  useEffect(() => {
    if (!editor || !initialPost) return;
    const content = initialPost.data ?? initialPost.html_data ?? "";
    editor.commands.setContent(content || { type: "doc", content: [{ type: "paragraph" }] }, {
      emitUpdate: false,
    });
  }, [editor, initialPost]);

  const resetComposer = useCallback(() => {
    form.reset({
      post_type: "daily_lesson",
      title: "",
      unit_ineligible: false,
      finished_unit: undefined,
    });
    editor?.commands.clearContent();
    setAttachments([]);
    setShouldFocusTitle(false);
    setPostToTeams(teamsSyncEligible);
  }, [editor, form, teamsSyncEligible]);

  const handleCancel = useCallback(() => {
    if (mode === "create") {
      setExpanded(false);
      resetComposer();
    }
    onCancel();
  }, [mode, onCancel, resetComposer]);

  useEffect(() => {
    if (mode !== "create" || !expanded || !shouldFocusTitle) return;

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const titleEl = composerTitleRef.current;
        if (titleEl) {
          scrollElementToViewportRatio(titleEl);
        }
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [expanded, shouldFocusTitle, mode]);

  useEffect(() => {
    if (mode !== "create" || !expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, expanded, handleCancel]);

  const focusBody = useCallback(() => {
    editor?.commands.focus("end");
  }, [editor]);

  const invalidateFeed = () => {
    queryClient.invalidateQueries({ queryKey: ["courseFeed", courseId] });
  };

  const createMutation = useMutation({
    mutationFn: (formData: FormData) =>
      makePostRequest("announcements", formData, {}, {}),
    onSuccess: () => {
      toast.add({ description: "Posted to the class feed" });
      invalidateFeed();
      resetComposer();
      setExpanded(false);
      onSuccess();
    },
    onError: (e) => {
      setFormErrrors(e, form);
      toast.add({ description: "Could not create post" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: CourseFeedUpdatePayload & { id: number }) => {
      const { id, ...rest } = payload;
      const formData = buildCourseFeedUpdateFormData(rest);
      return updateEntityWithFormData("announcements", id, formData);
    },
    onSuccess: () => {
      toast.add({
        description: mode === "edit" ? "Post updated" : "Posted to the class feed",
      });
      invalidateFeed();
      if (mode === "create") {
        resetComposer();
        setExpanded(false);
      }
      onSuccess();
    },
    onError: (e) => {
      setFormErrrors(e, form);
      toast.add({ description: "Could not update post" });
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const runCreate = (values: ComposerFormValues) => {
    const htmlContent = editor ? serializeCourseFeedEditorHtml(editor) : "";
    const formData = new FormData();
    formData.append("post_type", values.post_type);
    formData.append("course", String(courseId));
    if (values.post_type === "announcement" && values.title) {
      formData.append("title", values.title);
    }
    if (values.post_type === "daily_lesson" && !values.unit_ineligible && values.finished_unit != null) {
      formData.append("finished_unit", String(values.finished_unit));
    }
    if (htmlContent) {
      formData.append("data", htmlContent);
      formData.append("html_data", htmlContent);
    }
    if (user?.id) formData.append("created_by", String(user.id));
    attachments
      .filter((a): a is File => a instanceof File)
      .forEach((f) => formData.append("files", f));
    if (teamsSyncEligible) {
      formData.append("send_to_microsoft", postToTeams ? "true" : "false");
    }
    createMutation.mutate(formData);
  };

  const runUpdate = (values: ComposerFormValues) => {
    const htmlContent = editor ? serializeCourseFeedEditorHtml(editor) : "";
    if (!initialPost?.id) return;
    const currentInlineIds = new Set(
      collectInlineImageNodes(editor).flatMap((n) =>
        n.attachmentId != null ? [n.attachmentId] : [],
      ),
    );
    const removedInlineIds = initialInlineAttachmentIdsRef.current.filter(
      (id) => !currentInlineIds.has(id),
    );
    const payload = buildUpdatePayload(values, htmlContent, {
      courseId,
      postToTeams,
      teamsSyncEligible,
      attachments,
      deletedAttachmentIds: [...toDeletedAttachmentId, ...removedInlineIds],
    });
    updateMutation.mutate({ ...payload, id: initialPost.id });
  };

  const onSubmit = (values: ComposerFormValues) => {
    if (pendingInlineImages > 0) {
      toast.add({
        type: "error",
        description: "Wait for image uploads to finish before posting.",
      });
      return;
    }
    const inlineNodes = collectInlineImageNodes(editor);
    const hasInlineImages = inlineNodes.some((n) => n.attachmentId != null);
    const bodyText = editor?.getText().trim() ?? "";
    if (values.post_type === "daily_lesson" && !bodyText && !hasInlineImages) {
      toast.add({
        type: "error",
        description: "Add lesson notes or at least one image.",
      });
      return;
    }
    if (postToTeams && teamsSyncEligible && !teamsBudget.withinBudget) {
      toast.add({
        type: "error",
        title: "Too many images for Teams",
        description:
          teamsBudget.errors[0] ??
          "Uncheck Post to Teams or remove images to post to SuConnect only.",
      });
      return;
    }
    if (
      shouldPromptMicrosoftTeamsConnect(
        teamsSyncEligible,
        postToTeams,
        msPersonalConnected,
      )
    ) {
      toast.add({
        type: "error",
        title: "Microsoft Teams not connected",
        description:
          "Sign out and sign in again with Microsoft, or reconnect in Organization profile → Video.",
      });
      return;
    }
    if (mode === "edit") {
      runUpdate(values);
      return;
    }
    runCreate(values);
  };

  const handleTypeChange = (type: PostType) => {
    form.setValue("post_type", type, { shouldValidate: true });
    if (type === "announcement") {
      form.setValue("finished_unit", undefined);
      form.setValue("unit_ineligible", false);
    } else {
      form.setValue("title", "");
      form.setValue("unit_ineligible", false);
    }
  };

  if (mode === "create" && !expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setExpanded(true);
          setShouldFocusTitle(true);
        }}
        className="w-full rounded-xl border border-border/60 bg-card px-4 py-3 text-left text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
      >
        Share something with the class…
      </button>
    );
  }

  return (
    <div
      {...dropzone.getRootProps({
        className: cn(
          "rounded-xl border border-border/60 bg-card p-4 transition-colors",
          "focus-within:border-border focus-within:bg-muted/20",
          mode === "edit" && "border-dashed",
          dropzone.isDragActive && "ring-2 ring-primary/30 bg-muted/30",
        ),
        onPaste: (e) => {
          if (e.nativeEvent.defaultPrevented) return;
          handleComposerPaste(e.nativeEvent);
        },
      })}
    >
      <input
        {...dropzone.getInputProps()}
        accept={NON_IMAGE_ACCEPT_INPUT}
        className="sr-only"
      />
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={watchedPostType}
            ref={composerTitleRef}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="motion-reduce:transition-none"
          >
            {watchedPostType === "announcement" ? (
              <FeedTitleInput
                registration={form.register("title")}
                error={form.formState.errors.title?.message}
                autoFocus={shouldFocusTitle}
                onEnter={focusBody}
              />
            ) : (
              <DailyLessonUnitHeader
                registration={form.register("finished_unit")}
                error={form.formState.errors.finished_unit?.message}
                autoFocus={watchedPostType === "daily_lesson" && !unitIneligible}
                onEnter={focusBody}
                ineligible={unitIneligible}
                inputDisabled={unitIneligible}
                onIneligibleChange={(checked) => {
                  form.setValue("unit_ineligible", checked, {
                    shouldValidate: true,
                  });
                  if (checked) {
                    form.setValue("finished_unit", undefined, {
                      shouldValidate: true,
                    });
                  }
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>

        <div ref={bodyRef}>
          {editor && (
            <TextEditor
              editor={editor}
              isViewOnly={false}
              menuPlacement="inline"
              menuProps={{
                variant: "compact",
                teamsSafe: postToTeams,
                courseFeedImageUpload: {
                  courseId,
                  onPendingDelta: (delta) => {
                    setPendingInlineImages((n) => Math.max(0, n + delta));
                  },
                },
              }}
            />
          )}
        </div>

        <AttachmentUploader
          isAnnouncement
          entityName="announcement"
          attachments={attachments}
          setAttachments={setAttachments}
          maxFiles={10}
          isImageOnly={false}
          setToDeletedAttachmentId={setToDeletedAttachmentId}
          dropzone={dropzone}
        />

        <div className="flex flex-col gap-2 border-t border-border/50 pt-3 mt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              <FeedPostTypeMenu
                value={watchedPostType}
                onChange={handleTypeChange}
              />
              {teamsSyncEligible ? (
                <Field.Root className="flex flex-row items-center gap-2">
                  <Checkbox
                    id={`post-to-teams-${courseId}-${mode}`}
                    checked={postToTeams}
                    onCheckedChange={(checked) => {
                      const next = checked === true;
                      setPostToTeams(next);
                      if (next && editor && editorHasTeamsUnsupportedContent(editor)) {
                        toast.add({
                          description:
                            "Highlight, font size, tables, and checklists won't appear in Teams.",
                        });
                      }
                    }}
                  />
                  <Field.Label
                    htmlFor={`post-to-teams-${courseId}-${mode}`}
                    className="text-sm text-muted-foreground font-normal cursor-pointer"
                  >
                    Post to Teams
                  </Field.Label>
                </Field.Root>
              ) : null}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {mode === "edit" ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="text-sm text-muted-foreground hover:text-foreground px-1"
                >
                  Cancel
                </button>
              ) : null}
              <Button
                type="submit"
                size="sm"
                className="h-9 w-9 rounded-full shrink-0"
                isLoading={isPending}
                disabled={pendingInlineImages > 0}
                aria-label={mode === "edit" ? "Save post" : "Post"}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {teamsSyncEligible && postToTeams ? (
            <div className="space-y-1">
              <p
                className={cn(
                  "text-xs",
                  teamsBudget.withinBudget
                    ? "text-muted-foreground"
                    : "text-destructive",
                )}
              >
                {formatTeamsBudgetSummary(teamsBudget)}
                {teamsBudget.withinBudget ? " ✓" : " — exceeds Teams limit"}
              </p>
              <p className="text-xs text-muted-foreground">
                {channelsLoading
                  ? "Loading Teams channel…"
                  : `Posting to ${targetChannelName === "General" ? "General (default)" : targetChannelName}`}
              </p>
              {msPersonalConnected ? (
                <p className="text-xs text-muted-foreground">
                  Posting as{" "}
                  <span className="font-medium text-foreground">
                    {(msPersonalStatus?.authorized_upn || "").trim() ||
                      (msPersonalStatus?.authorized_display_name || "").trim() ||
                      "you"}
                  </span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Teams connection missing.{" "}
                  <Link
                    href="/organizations/profile?section=video"
                    className="underline underline-offset-2"
                  >
                    Reconnect in profile
                  </Link>{" "}
                  or sign in again with Microsoft.
                </p>
              )}
            </div>
          ) : null}
        </div>
      </form>
    </div>
  );
}
