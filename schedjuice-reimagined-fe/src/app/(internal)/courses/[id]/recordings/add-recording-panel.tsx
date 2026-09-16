"use client";

import { useCallback, useMemo, useState } from "react";
import { z } from "zod";
import { useDropzone } from "react-dropzone";
import { format } from "date-fns";
import { getCookie } from "cookies-next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { axiosClient } from "@/lib/api";
import { startTusUploadWithQueue } from "@/helpers/tusUpload";
import { RequiredMark } from "@/components/form/required-mark";
import { scheduleScrollToFirstFormError } from "@/helpers/form";
import { useToast } from "@/components/primitives";
import { Label } from "@/components/courses/ui/label";
import { Input } from "@/components/primitives";
import { Textarea } from "@/components/primitives";
import { Button } from "@/components/primitives";
import { DatePicker } from "@/components/courses/ui/date-picker";
import { ToggleGroup, ToggleGroupItem } from "@/components/courses/ui/toggle-group";
import {
  Link as Link2,
  MediaVideo as FileVideo,
  MediaVideo as Video,
  CloudUpload as UploadCloud,
  Xmark as X,
  Youtube,
} from "iconoir-react";

import { cn } from "@/lib/utils";
import {
  extractYouTubeVideoId,
  youTubeThumbnailUrl,
} from "@/lib/youtube";

const schema = z.object({
  recorded_date: z.coerce.date({ required_error: "Recorded date is required." }),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;
type SourceMode = "file" | "youtube";

interface Props {
  courseId: string;
  onCancel: () => void;
  onUploaded: () => void;
}

export default function AddRecordingPanel({
  courseId,
  onCancel,
  onUploaded,
}: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<SourceMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { description: "" },
  });

  const recordedDate = form.watch("recorded_date");
  const youtubeVideoId = useMemo(
    () => extractYouTubeVideoId(youtubeUrl),
    [youtubeUrl]
  );

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "video/*": [] },
    maxFiles: 1,
    noKeyboard: true,
    disabled: mode !== "file",
  });

  function reset() {
    setMode("file");
    setFile(null);
    setYoutubeUrl("");
    setIsSubmitting(false);
    form.reset({ description: "" });
  }

  async function handleSubmit(values: FormValues) {
    if (mode === "file") {
      if (!file) {
        toast.add({
          title: "Please choose a video file.",
        });
        return;
      }
      setIsSubmitting(true);
      try {
        const res = await axiosClient.post("user-recordings", {
          course: Number(courseId),
          recorded_date: format(values.recorded_date, "yyyy-MM-dd"),
          description: values.description ?? "",
          source_type: "file",
        });
        const recordingId: number = res.data.data.id;
        startTusUploadWithQueue(file, {
          tableName: "app_course_useruploadedrecording",
          foreignKey: String(recordingId),
          token: getCookie("access") as string,
        });
        toast.add({
          title: "Upload started",
          description: "Your recording is uploading in the background.",
        });
        reset();
        onUploaded();
      } catch {
        toast.add({
          title: "Failed to create recording",
          description: "Please try again.",
        });
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!youtubeVideoId) {
      toast.add({
        title: "Enter a valid YouTube link.",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await axiosClient.post("user-recordings", {
        course: Number(courseId),
        recorded_date: format(values.recorded_date, "yyyy-MM-dd"),
        description: values.description ?? "",
        source_type: "youtube",
        youtube_url: youtubeUrl.trim(),
      });
      toast.add({
        title: "Recording added",
        description: "The YouTube recording is ready to play.",
      });
      reset();
      onUploaded();
    } catch {
      toast.add({
        title: "Failed to add YouTube recording",
        description: "Please check the link and try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCancel() {
    reset();
    onCancel();
  }

  const youtubeUrlError =
    mode === "youtube" && youtubeUrl.trim() && !youtubeVideoId;

  return (
    <section
      aria-label="Add recording"
      className="rounded-xl border border-border/60 bg-surface-hover/10 p-4 sm:p-6"
    >
      <h2 className="mb-4 text-base font-semibold tracking-tight">
        Add Recording
      </h2>

      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(value) => {
          if (value) setMode(value as SourceMode);
        }}
        className="mb-6 flex w-full justify-normal rounded-xl bg-secondary p-1"
      >
        <ToggleGroupItem
          value="file"
          className="flex-1 rounded-lg border-0 bg-transparent shadow-none data-[state=on]:bg-surface data-[state=on]:text-text-primary data-[state=on]:shadow-sm"
        >
          Upload file
        </ToggleGroupItem>
        <ToggleGroupItem
          value="youtube"
          className="flex-1 rounded-lg border-0 bg-transparent shadow-none data-[state=on]:bg-surface data-[state=on]:text-text-primary data-[state=on]:shadow-sm"
        >
          YouTube link
        </ToggleGroupItem>
      </ToggleGroup>

      <form
        onSubmit={form.handleSubmit(handleSubmit, () =>
          scheduleScrollToFirstFormError(form),
        )}
        className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8"
      >
        {/* Left column: metadata + actions */}
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="recorded-date">
              Recorded Date
              <RequiredMark />
            </Label>
            <DatePicker
              id="recorded-date"
              date={recordedDate}
              setDate={(date) => {
                if (date) form.setValue("recorded_date", date, { shouldValidate: true });
              }}
              className="w-full"
            />
            {form.formState.errors.recorded_date && (
              <p className="text-xs text-destructive">
                {form.formState.errors.recorded_date.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="recording-description">Description</Label>
            <Textarea
              id="recording-description"
              placeholder="Optional — e.g. Chapter 3 review session"
              rows={3}
              {...form.register("description")}
            />
            <p className="text-xs text-text-muted">
              Optional — students will see this when viewing the recording.
            </p>
          </div>

          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isSubmitting}
              className="active:scale-[0.98]"
            >
              Add recording
            </Button>
          </div>
        </div>

        {/* Right column: source input + fixed media slot */}
        <div className="flex min-h-0 flex-col gap-2">
          {/* Fixed-height URL row — reserved in file mode to prevent layout shift */}
          <div className="min-h-19 space-y-1.5">
            <Label
              htmlFor="youtube-url"
              className={cn(mode !== "youtube" && "sr-only")}
            >
              YouTube Link
              {mode === "youtube" ? <RequiredMark /> : null}
            </Label>
            <div
              className={cn(
                "relative",
                mode !== "youtube" && "pointer-events-none invisible"
              )}
              aria-hidden={mode !== "youtube"}
            >
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <Input
                id="youtube-url"
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="pl-9"
                tabIndex={mode === "youtube" ? 0 : -1}
              />
            </div>
            <p
              className={cn(
                "min-h-4 text-xs",
                youtubeUrlError ? "text-destructive" : "invisible"
              )}
              aria-live="polite"
            >
              Enter a valid YouTube watch, share, embed, or Shorts link.
            </p>
          </div>

          <Label className={mode === "file" ? undefined : "sr-only"}>
            {mode === "file" ? (
              <>
                Video File
                <RequiredMark />
              </>
            ) : (
              "Preview"
            )}
          </Label>

          <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-surface-hover/20">
            {mode === "file" ? (
              file ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface-hover/30 p-4">
                  <FileVideo className="h-10 w-10 text-text-muted" />
                  <span className="max-w-full truncate text-sm font-medium">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs hover:bg-surface-hover"
                    aria-label="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              ) : (
                <div
                  {...getRootProps({
                    className: cn(
                      "flex h-full cursor-pointer flex-col items-center justify-center p-4 text-center outline-none transition-colors",
                      "border-0 bg-transparent hover:bg-surface-hover/40",
                      isDragActive && "bg-surface-hover/50"
                    ),
                  })}
                >
                  <input {...getInputProps()} />
                  <UploadCloud
                    className={cn(
                      "mb-2 h-8 w-8",
                      isDragActive ? "text-primary" : "text-text-muted"
                    )}
                  />
                  <p className="text-sm">
                    {isDragActive ? (
                      <span className="text-primary">Drop to add</span>
                    ) : (
                      <>
                        Drag & drop or{" "}
                        <span className="font-medium">click</span> to select
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    MP4, MKV, MOV and other video formats
                  </p>
                </div>
              )
            ) : youtubeVideoId ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={youTubeThumbnailUrl(youtubeVideoId)}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-surface/90 px-3 py-2 text-xs text-text-muted backdrop-blur-sm">
                  <Youtube className="h-4 w-4 shrink-0 text-red-500" />
                  <span className="truncate">
                    Preview ready — video ID {youtubeVideoId}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-text-muted">
                <Video className="h-8 w-8 opacity-40" />
                <p className="text-sm">
                  {youtubeUrl.trim()
                    ? "Enter a valid YouTube link to preview"
                    : "Paste a YouTube link above to preview"}
                </p>
              </div>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
