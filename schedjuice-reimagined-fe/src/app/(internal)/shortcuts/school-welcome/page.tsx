"use client";

import { PageContainer } from "@/components/layout/page-container";
import { usePageHeader } from "@/components/shell/use-page-header";
import { axiosClient } from "@/lib/api";
import { queryClient } from "@/lib/query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEditor } from "@tiptap/react";
import { getDefaultEditorOptions } from "@/components/editor/config";
import TextEditor from "@/components/editor/editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/reports/report-card";
import { RadioGroup, Radio } from "@/components/primitives";
import { usePermissions } from "@/hooks/usePermissions";
import { useUser } from "@/hooks/useUser";
import { deleteEntity } from "@/app/client-api/utils";
import { uploadAttachments } from "@/helpers/file";
import { attachmentType } from "@/types/attachment";
import {
  WelcomeBoardAudience,
  type WelcomeBoardPayload,
} from "@/types/welcome-board";
import AttachmentUploader from "@/components/attachment-uploader/attachment-uploader";
import { RecordingVideoPlayer, filePlaybackSource } from "@/components/media/recording-video-player";
import Link from "next/link";
import { NavArrowLeft } from "iconoir-react";
import { cn } from "@/lib/utils";
import { Button, Skeleton } from "@/components/primitives";

function isVideoType(fileType: string | undefined | null) {
  return (fileType || "").toLowerCase().startsWith("video/");
}

function isPdfType(fileType: string | undefined | null) {
  return (fileType || "").toLowerCase().includes("pdf");
}

export default function SchoolWelcomePage() {
  const { user, isLoading: userLoading } = useUser();
  const { can } = usePermissions();
  const canManageWelcomeBoard = can("announcement.manage");
  const [isEditing, setIsEditing] = useState(false);
  const [editAudience, setEditAudience] = useState<WelcomeBoardAudience>(
    WelcomeBoardAudience.staff,
  );
  const [attachments, setAttachments] = useState<(attachmentType | File)[]>(
    [],
  );
  const [toDeletedAttachmentId, setToDeletedAttachmentId] = useState<number[]>(
    [],
  );

  const editor = useEditor(getDefaultEditorOptions());

  const forMeQuery = useQuery({
    queryKey: ["welcome-board-for-me"],
    queryFn: async () => {
      const res = await axiosClient.get<{ data: WelcomeBoardPayload }>(
        "welcome-boards/for-me",
      );
      return res.data.data;
    },
    enabled: !userLoading && !!user,
  });

  const listQuery = useQuery({
    queryKey: ["welcome-board-list"],
    queryFn: async () => {
      const res = await axiosClient.get<{ data: WelcomeBoardPayload[] }>(
        "welcome-boards",
      );
      return res.data.data;
    },
    enabled:
      !userLoading && !!user && canManageWelcomeBoard && isEditing,
  });

  const boardForEdit = useMemo(() => {
    if (!isEditing) return null;
    if (canManageWelcomeBoard && listQuery.data?.length) {
      return (
        listQuery.data.find((b) => b.audience === editAudience) ?? null
      );
    }
    return forMeQuery.data ?? null;
  }, [
    isEditing,
    canManageWelcomeBoard,
    listQuery.data,
    editAudience,
    forMeQuery.data,
  ]);

  useEffect(() => {
    if (!isEditing || !boardForEdit || !editor) return;
    editor.commands.setContent(boardForEdit.body_html || "");
    setAttachments(boardForEdit.attachments ?? []);
    setToDeletedAttachmentId([]);
  }, [isEditing, boardForEdit?.id, editAudience, editor, boardForEdit]);

  useEffect(() => {
    if (forMeQuery.data?.resolved_audience) {
      setEditAudience(forMeQuery.data.resolved_audience as WelcomeBoardAudience);
    }
  }, [forMeQuery.data?.resolved_audience]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editor || !boardForEdit) throw new Error("Missing editor or board");
      const audience = canManageWelcomeBoard
        ? editAudience
        : (boardForEdit.audience as WelcomeBoardAudience);
      await axiosClient.patch(`welcome-boards/${audience}`, {
        body_html: editor.getHTML(),
        body_plain: editor.getText({ blockSeparator: "\n" }),
      });
      const uniqueDeletes = Array.from(new Set(toDeletedAttachmentId));
      for (const id of uniqueDeletes) {
        await deleteEntity("attachments", id);
      }
      const newFiles = attachments.filter((a): a is File => a instanceof File);
      if (newFiles.length > 0) {
        await uploadAttachments(
          newFiles,
          "welcome_board",
          String(boardForEdit.id),
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["welcome-board-for-me"] });
      await queryClient.invalidateQueries({ queryKey: ["welcome-board-list"] });
      setIsEditing(false);
      setToDeletedAttachmentId([]);
    },
  });

  const viewBoard = forMeQuery.data;
  const canEdit = viewBoard?.can_edit ?? false;
  const isSaving = saveMutation.isPending;
  const isListLoadingForEdit =
    canManageWelcomeBoard && isEditing && listQuery.isLoading;

  const startEdit = useCallback(() => {
    if (forMeQuery.data?.resolved_audience) {
      setEditAudience(
        forMeQuery.data.resolved_audience as WelcomeBoardAudience,
      );
    }
    setIsEditing(true);
  }, [forMeQuery.data?.resolved_audience]);


  usePageHeader(
    useMemo(
      () => ({
        breadcrumb: (
          <h1 className="font-serif text-lg text-text-primary">School welcome</h1>
        ),
      }),
      [],
    ),
  );
  if (userLoading || forMeQuery.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (forMeQuery.isError || !viewBoard) {
    return (
      <p className="text-danger text-sm" role="alert">
        Could not load this page. Please try again.
      </p>
    );
  }

  return  (
<PageContainer width="default" className="space-y-6">
      <nav aria-label="Back to shortcuts">
        <Link
          href="/shortcuts"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          <NavArrowLeft className="size-4 shrink-0" aria-hidden />
          Shortcuts
        </Link>
      </nav>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:max-w-xl lg:shrink-0">
          {canEdit && isEditing && canManageWelcomeBoard && (
            <fieldset
              className="m-0 min-w-0 border-0 p-0 sm:mr-2"
              aria-busy={isSaving || isListLoadingForEdit}
            >
              <legend className="sr-only">Which welcome page to edit</legend>
              <RadioGroup
                value={editAudience}
                onValueChange={(v) =>
                  setEditAudience(v as WelcomeBoardAudience)
                }
                disabled={isSaving || isListLoadingForEdit}
                className="flex flex-row flex-wrap items-center gap-x-5 gap-y-2"
              >
                <div className="flex items-center gap-2">
                  <Radio
                    value={WelcomeBoardAudience.staff}
                    id="welcome-edit-audience-staff"
                  />
                  <label
                    htmlFor="welcome-edit-audience-staff"
                    className={cn(
                      "font-normal",
                      isSaving || isListLoadingForEdit
                        ? "cursor-not-allowed opacity-70"
                        : "cursor-pointer",
                    )}
                  >
                    Staff and teachers
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Radio
                    value={WelcomeBoardAudience.student}
                    id="welcome-edit-audience-student"
                  />
                  <label
                    htmlFor="welcome-edit-audience-student"
                    className={cn(
                      "font-normal",
                      isSaving || isListLoadingForEdit
                        ? "cursor-not-allowed opacity-70"
                        : "cursor-pointer",
                    )}
                  >
                    Students
                  </label>
                </div>
              </RadioGroup>
            </fieldset>
          )}
          {canEdit && (
            <div className="flex justify-end gap-2">
              {isEditing ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isSaving || isListLoadingForEdit}
                    onClick={() => {
                      setIsEditing(false);
                      setToDeletedAttachmentId([]);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => saveMutation.mutate()}
                    isLoading={isSaving}
                    disabled={isSaving || isListLoadingForEdit}
                  >
                    Save
                  </Button>
                </>
              ) : (
                <Button type="button" onClick={startEdit}>
                  Edit
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {!isEditing && (
        <ReadOnlyWelcome board={viewBoard} />
      )}

      {isEditing && canEdit && (
        <Card aria-busy={isSaving}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">
              {canManageWelcomeBoard
                ? "Edit welcome content"
                : "Edit your school welcome"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {listQuery.isLoading && canManageWelcomeBoard ? (
              <Skeleton className="h-40 w-full" aria-busy="true" />
            ) : (
              editor && (
                <>
                  <TextEditor
                    editor={editor}
                    isViewOnly={isSaving || isListLoadingForEdit}
                  />
                  <div className="mt-6 space-y-2">
                    <p className="text-sm font-medium">Attachments</p>
                    <p className="text-text-muted text-xs">
                      Add files below the message — handbooks, PDFs, photos, or
                      videos.
                    </p>
                    <div
                      className={cn(
                        isSaving && "pointer-events-none opacity-60",
                      )}
                      aria-busy={isSaving}
                    >
                      <AttachmentUploader
                        entityName="welcome_board"
                        attachments={attachments}
                        setAttachments={setAttachments}
                        maxFiles={20}
                        setToDeletedAttachmentId={setToDeletedAttachmentId}
                      />
                    </div>
                  </div>
                </>
              )
            )}
          </CardContent>
        </Card>
      )}
    </PageContainer>
);
}

function ReadOnlyWelcome({ board }: { board: WelcomeBoardPayload }) {
  const empty = board.is_effectively_empty;
  const showEditorHint = board.can_edit && empty;
  const showNeutral = !board.can_edit && empty;

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        {showNeutral && (
          <p className="text-text-muted text-sm">
            Your school has not posted a welcome page yet.
          </p>
        )}
        {showEditorHint && (
          <p className="text-text-muted text-sm">
            Add a welcome message and optional files so new people know where to
            go. Use Edit to get started.
          </p>
        )}
        {!empty && board.body_html && (
          <div
            className="welcome-board-html max-w-none space-y-3 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: board.body_html }}
          />
        )}
        {board.attachments?.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm font-medium">Attachments</p>
            <ul className="space-y-4">
              {board.attachments.map((att) => (
                <li key={att.id} className="space-y-2">
                  <AttachmentReadRow att={att} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AttachmentReadRow({ att }: { att: attachmentType }) {
  const url = typeof att.data === "string" ? att.data : null;
  const name = att.filename || "File";

  if (isVideoType(att.file_type) && url) {
    return (
      <div className="space-y-2">
        <p className="text-text-muted text-xs">{name}</p>
        <RecordingVideoPlayer source={filePlaybackSource(url)} emptyLabel="Video unavailable" />
      </div>
    );
  }

  if (att.is_image && url) {
    return (
      <div className="space-y-2">
        <p className="text-text-muted text-xs">{name}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className="max-h-96 w-full max-w-2xl rounded-lg border object-contain"
        />
      </div>
    );
  }

  if (isPdfType(att.file_type) && url) {
    return (
      <div className="space-y-2">
        <p className="text-text-muted text-xs">{name}</p>
        <Link
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary text-sm underline"
        >
          Open PDF
        </Link>
      </div>
    );
  }

  if (url) {
    return (
      <Link
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary text-sm underline"
      >
        {name}
      </Link>
    );
  }

  return <span className="text-text-muted text-sm">{name}</span>;
}
