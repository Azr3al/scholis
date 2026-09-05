"use client";
import { Spinner } from "@/components/primitives/spinner";
import { Skeleton, Button } from "@/components/primitives";

import { PageContainer } from "@/components/layout/page-container";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseAsInteger, useQueryState } from "nuqs";
import { axiosClient } from "@/lib/api";
import { makeSearchParams } from "@/app/client-api/utils";
import { queryParamDefault } from "@/config/defaults";
import BackButton from "@/components/misc/back-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/courses/ui/card";
import { ScrollArea } from "@/components/courses/ui/scroll-area";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Play, VideoCamera, Upload, Trash, ShareAndroid, Youtube } from "iconoir-react";
import { cn } from "@/lib/utils";
import { useUser } from "@/hooks/useUser";
import { isStudent, hasAdminCredentials } from "@/helpers/authorization";
import ConfirmationDialog from "@/components/misc/confirmation-dialog";
import AddRecordingPanel from "./add-recording-panel";
import ShareRecordingPanel from "./share-recording-panel";
import { useToast } from "@/components/primitives";
import { getCookie } from "cookies-next";
import { getJuiceBoxOrigin } from "@/lib/juicebox/auth";
import { useCourseHub } from "@/contexts/course-hub-context";
import {
  RecordingVideoPlayer,
  filePlaybackSource,
  playbackFromUserRecording,
  youTubePlaybackSource,
} from "@/components/media/recording-video-player";
import type { RecordingPlaybackSource } from "@/components/media/recording-playback-types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamsRecording {
  id: number;
  created_datetime: string | null;
  download_url: string;
}

interface UserRecording {
  id: number;
  display_label: string;
  description: string;
  recorded_date: string;
  source_type: "file" | "youtube";
  youtube_url: string | null;
  youtube_video_id: string | null;
  download_url: string | null;
  playback?: RecordingPlaybackSource | null;
  uploaded_by: number | null;
  course: number;
}

interface ListResponse<T> {
  data: T[];
  count: number;
}

const teamsRecordingMonthSource = (r: TeamsRecording) => r.created_datetime;
const uploadedRecordingMonthSource = (r: UserRecording) => r.recorded_date;

type ShareRecordingType = "teams" | "uploaded";

function shareKey(type: ShareRecordingType, recId: number) {
  return `${type}-${recId}`;
}

function watchUrlFromToken(token: string) {
  return `${window.location.origin}/watch/${token}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRecordedDate(isoString: string | null): string {
  if (!isoString) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(isoString));
  } catch {
    return String(isoString);
  }
}

const UNKNOWN_MONTH_KEY = "__unknown__";

function monthKeyFromIso(iso: string | null): string {
  if (!iso) return UNKNOWN_MONTH_KEY;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return UNKNOWN_MONTH_KEY;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthHeading(monthKey: string): string {
  if (monthKey === UNKNOWN_MONTH_KEY) return "Unknown date";
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, 1));
}

function dateMsFromIso(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function groupRecordingsByMonth<T extends { id: number }>(
  recordings: T[],
  getIso: (r: T) => string | null
): { monthKey: string; label: string; items: T[] }[] {
  const sorted = [...recordings].sort(
    (a, b) => dateMsFromIso(getIso(b)) - dateMsFromIso(getIso(a))
  );
  const map = new Map<string, T[]>();
  for (const r of sorted) {
    const key = monthKeyFromIso(getIso(r));
    const bucket = map.get(key);
    if (bucket) bucket.push(r);
    else map.set(key, [r]);
  }
  const keys = Array.from(map.keys()).sort((a, b) => {
    if (a === UNKNOWN_MONTH_KEY) return 1;
    if (b === UNKNOWN_MONTH_KEY) return -1;
    return b.localeCompare(a);
  });
  return keys.map((monthKey) => ({
    monthKey,
    label: formatMonthHeading(monthKey),
    items: map.get(monthKey)!,
  }));
}

// ─── Shared recording list + video player ────────────────────────────────────

interface RecordingListProps<T extends { id: number }> {
  recordings: T[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  getLabel: (r: T) => string;
  getSubLabel?: (r: T) => string | undefined;
  renderAction?: (r: T) => React.ReactNode;
  /** When set, list is grouped under month headings (newest months first). */
  groupDatesBy?: (r: T) => string | null;
}

function RecordingList<T extends { id: number }>({
  recordings,
  selectedId,
  onSelect,
  getLabel,
  getSubLabel,
  renderAction,
  groupDatesBy,
}: RecordingListProps<T>) {
  const groups = useMemo(() => {
    if (!groupDatesBy) return null;
    return groupRecordingsByMonth(recordings, groupDatesBy);
  }, [recordings, groupDatesBy]);

  const rows = (items: T[]) =>
    items.map((r) => (
      <div
        key={r.id}
        className={cn(
          "group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors border-l-2",
          selectedId === r.id
            ? "border-l-primary bg-accent/50 font-medium text-text-primary"
            : "border-l-transparent text-text-secondary hover:bg-accent hover:text-accent-foreground"
        )}
      >
        <button
          type="button"
          role="listitem"
          onClick={() => onSelect(r.id)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Play
            className={cn(
              "h-4 w-4 shrink-0",
              selectedId === r.id ? "text-primary" : "text-text-secondary"
            )}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="truncate tabular-nums">{getLabel(r)}</p>
            {getSubLabel?.(r) && (
              <p className="truncate text-xs text-text-secondary">
                {getSubLabel(r)}
              </p>
            )}
          </div>
        </button>
        {renderAction?.(r)}
      </div>
    ));

  return (
    <ScrollArea className="h-[220px] lg:h-[min(420px,50vh)]">
      {groups ? (
        <div className="space-y-4 pr-2">
          {groups.map((g) => (
            <div key={g.monthKey}>
              <p className="mb-2 px-3 text-xs font-semibold text-text-secondary">
                {g.label}
              </p>
              <nav className="space-y-0.5" role="list">
                {rows(g.items)}
              </nav>
            </div>
          ))}
        </div>
      ) : (
        <nav className="space-y-0.5 pr-2" role="list">
          {rows(recordings)}
        </nav>
      )}
    </ScrollArea>
  );
}

function RecordingPanelSkeleton() {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6" aria-busy="true">
      <aside className="shrink-0 space-y-2 lg:w-72 lg:min-w-0 lg:border-r lg:border-border lg:pr-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-lg border p-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </div>
        ))}
      </aside>
      <main className="min-w-0 flex-1 space-y-3">
        <Skeleton className="aspect-video w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </main>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CourseRecordingsPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { course, isCourseLoading } = useCourseHub();

  const [teamsId, setTeamsId] = useQueryState("recording", parseAsInteger);
  const [uploadedId, setUploadedId] = useQueryState(
    "user_recording",
    parseAsInteger
  );
  const [isAdding, setIsAdding] = useState(false);
  const shareLinkExpiresInDays = 10;

  // ── Teams recordings ──────────────────────────────────────────────────────
  const teamsQuery = useQuery<ListResponse<TeamsRecording>>({
    queryKey: ["recordings", id],
    queryFn: async () => {
      const params = makeSearchParams({ ...queryParamDefault, size: 50 });
      const res = await axiosClient.get<ListResponse<TeamsRecording>>(
        `recordings?course_id=${id}&${params.slice(1)}`
      );
      return res.data;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const teamsRecordings = useMemo(() => {
    const list = [...(teamsQuery.data?.data ?? [])];
    list.sort(
      (a, b) =>
        dateMsFromIso(b.created_datetime) - dateMsFromIso(a.created_datetime)
    );
    return list;
  }, [teamsQuery.data?.data]);

  const selectedTeams =
    teamsRecordings.find((r) => r.id === teamsId) ?? teamsRecordings[0] ?? null;

  useEffect(() => {
    if (teamsRecordings.length > 0 && teamsId != null && !teamsRecordings.some((r) => r.id === teamsId)) {
      setTeamsId(teamsRecordings[0].id);
    } else if (teamsRecordings.length === 0 && teamsId != null) {
      setTeamsId(null);
    }
  }, [teamsRecordings, teamsId, setTeamsId]);

  // ── User-uploaded recordings ──────────────────────────────────────────────
  const uploadedQuery = useQuery<ListResponse<UserRecording>>({
    queryKey: ["user-recordings", id],
    queryFn: async () => {
      const params = makeSearchParams({ ...queryParamDefault, size: 100 });
      const res = await axiosClient.get<ListResponse<UserRecording>>(
        `user-recordings?course_id=${id}&${params.slice(1)}`
      );
      return res.data;
    },
    retry: false, // students get 403 — treat as empty
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const uploadedRecordings = useMemo(() => {
    const list = [...(uploadedQuery.data?.data ?? [])];
    list.sort(
      (a, b) =>
        dateMsFromIso(b.recorded_date) - dateMsFromIso(a.recorded_date)
    );
    return list;
  }, [uploadedQuery.data?.data]);

  const selectedUploaded =
    uploadedRecordings.find((r) => r.id === uploadedId) ??
    uploadedRecordings[0] ??
    null;

  useEffect(() => {
    if (uploadedRecordings.length > 0 && uploadedId != null && !uploadedRecordings.some((r) => r.id === uploadedId)) {
      setUploadedId(uploadedRecordings[0].id);
    } else if (uploadedRecordings.length === 0 && uploadedId != null) {
      setUploadedId(null);
    }
  }, [uploadedRecordings, uploadedId, setUploadedId]);

  // ── Presigned URL: prefer Django list payload (same as share/watch); juice-box only as fallback ──
  const isYouTubeRecording = selectedUploaded?.source_type === "youtube";

  const needsJuiceBoxPlaybackUrl =
    !!selectedUploaded &&
    !isYouTubeRecording &&
    !selectedUploaded.download_url &&
    Boolean(process.env.NEXT_PUBLIC_JUICEBOX_ORIGIN);

  const juiceBoxDownloadQuery = useQuery<string | null>({
    queryKey: ["uploaded-download-url", selectedUploaded?.id],
    queryFn: async () => {
      if (!selectedUploaded) return null;
      const origin = getJuiceBoxOrigin();
      const schema = getCookie("schema");
      const token = getCookie("access");
      const res = await fetch(
        `${origin}/attachments/app_course_useruploadedrecording/${selectedUploaded.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            ...(schema ? { "X-Schema": String(schema) } : {}),
          },
        },
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data.attachments?.[0]?.downloadUrl ?? null;
    },
    enabled: needsJuiceBoxPlaybackUrl,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const uploadedPlaybackUrl =
    selectedUploaded?.download_url ?? juiceBoxDownloadQuery.data ?? null;

  const uploadedUrlLoading =
    needsJuiceBoxPlaybackUrl && juiceBoxDownloadQuery.isLoading;

  const uploadedPlaybackSource: RecordingPlaybackSource | null = useMemo(() => {
    if (!selectedUploaded) return null;

    const fromApi = playbackFromUserRecording(selectedUploaded);
    if (fromApi?.kind === "youtube") return fromApi;
    if (fromApi?.kind === "file" && fromApi.url) return fromApi;

    if (uploadedPlaybackUrl) {
      return filePlaybackSource(uploadedPlaybackUrl);
    }

    if (
      selectedUploaded.source_type === "youtube" &&
      selectedUploaded.youtube_video_id
    ) {
      return youTubePlaybackSource(
        selectedUploaded.youtube_video_id,
        selectedUploaded.youtube_url
      );
    }

    return null;
  }, [selectedUploaded, uploadedPlaybackUrl]);

  // ── Delete mutation ───────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (recId: number) =>
      axiosClient.delete(`user-recordings/${recId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-recordings", id] });
      toast.add({ title: "Recording deleted." });
    },
    onError: () =>
      toast.add({ title: "Failed to delete recording." }),
  });

  // ── Share link cache ────────────────────────────────────────────────────
  const [shareUrls, setShareUrls] = useState<Record<string, string>>({});
  const [shareErrors, setShareErrors] = useState<Record<string, boolean>>({});
  const [sharingId, setSharingId] = useState<string | null>(null);

  const shareTeamsMutation = useMutation({
    mutationFn: async (recId: number) => {
      const res = await axiosClient.post(`recordings/${recId}/share`);
      return res.data.data.token as string;
    },
    onMutate: (recId) => {
      const key = shareKey("teams", recId);
      setSharingId(key);
      setShareErrors((prev) => ({ ...prev, [key]: false }));
    },
    onSuccess: (token, recId) => {
      const key = shareKey("teams", recId);
      setShareUrls((prev) => ({ ...prev, [key]: watchUrlFromToken(token) }));
      setSharingId(null);
    },
    onError: (_err, recId) => {
      const key = shareKey("teams", recId);
      setShareErrors((prev) => ({ ...prev, [key]: true }));
      setSharingId(null);
      toast.add({ title: "Failed to generate share link." });
    },
  });

  const shareUploadedMutation = useMutation({
    mutationFn: async (recId: number) => {
      const res = await axiosClient.post(`user-recordings/${recId}/share`);
      return res.data.data.token as string;
    },
    onMutate: (recId) => {
      const key = shareKey("uploaded", recId);
      setSharingId(key);
      setShareErrors((prev) => ({ ...prev, [key]: false }));
    },
    onSuccess: (token, recId) => {
      const key = shareKey("uploaded", recId);
      setShareUrls((prev) => ({ ...prev, [key]: watchUrlFromToken(token) }));
      setSharingId(null);
    },
    onError: (_err, recId) => {
      const key = shareKey("uploaded", recId);
      setShareErrors((prev) => ({ ...prev, [key]: true }));
      setSharingId(null);
      toast.add({ title: "Failed to generate share link." });
    },
  });

  const canUpload = user && !isStudent(user);

  const getShareUrl = useCallback(
    async (type: ShareRecordingType, recId: number) => {
      const key = shareKey(type, recId);
      const cached = shareUrls[key];
      if (cached) return cached;

      const token =
        type === "teams"
          ? await shareTeamsMutation.mutateAsync(recId)
          : await shareUploadedMutation.mutateAsync(recId);
      return watchUrlFromToken(token);
    },
    [shareUrls, shareTeamsMutation, shareUploadedMutation]
  );

  const copyShareLink = useCallback(
    async (
      type: ShareRecordingType,
      recId: number,
      onSelect?: () => void
    ) => {
      onSelect?.();
      try {
        const url = await getShareUrl(type, recId);
        await navigator.clipboard.writeText(url);
        toast.add({ title: "Share link copied." });
      } catch {
        // Error toast handled by mutation onError
      }
    },
    [getShareUrl, toast]
  );

  useEffect(() => {
    if (!canUpload || !selectedTeams) return;
    const key = shareKey("teams", selectedTeams.id);
    if (shareUrls[key] || sharingId === key) return;
    shareTeamsMutation.mutate(selectedTeams.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once per selection
  }, [canUpload, selectedTeams?.id]);

  useEffect(() => {
    if (!canUpload || !selectedUploaded) return;
    const key = shareKey("uploaded", selectedUploaded.id);
    if (shareUrls[key] || sharingId === key) return;
    shareUploadedMutation.mutate(selectedUploaded.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once per selection
  }, [canUpload, selectedUploaded?.id]);

  const canDelete = (rec: UserRecording) =>
    user && (rec.uploaded_by === user.id || hasAdminCredentials(user));

  const courseHeading =
    typeof course.title === "string" ? course.title : "Course";

  useEffect(() => {
    if (isCourseLoading || !course.id) return;
    if (typeof course.title !== "string") return;
    const prev = document.title;
    document.title = `${course.title} · Recordings`;
    return () => {
      document.title = prev;
    };
  }, [isCourseLoading, course.id, course.title]);

  if (isCourseLoading) {
    return (
      <Skeleton className="min-h-[200px] w-full rounded-xl" aria-busy />
    );
  }

  if (!course.id) {
    return (
      <p className="text-sm text-text-secondary" role="alert">
        Course could not be loaded.
      </p>
    );
  }

  return  (
<PageContainer width="default" className="space-y-4">
      <BackButton href={`/courses/${id}`} />
      <h1 className="text-2xl font-semibold tracking-tight">{courseHeading}</h1>

      {/* ── Teams Recordings ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <VideoCamera className="h-6 w-6" aria-hidden />
            Meeting Recordings
          </CardTitle>
          <CardDescription>
            Teams meeting recordings for this course. Select a recording to
            stream. Shared links stay active for 10 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {teamsQuery.isLoading ? (
            <RecordingPanelSkeleton />
          ) : teamsQuery.isError ? (
            <p className="text-destructive text-sm" role="alert">
              Failed to load recordings. Please try again.
            </p>
          ) : teamsRecordings.length === 0 ? (
            <p className="text-text-secondary text-sm py-8 text-center">
              No recordings yet. Recordings sync from Teams when meetings end.
            </p>
          ) : (
            <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
              <aside
                className="shrink-0 lg:w-72 lg:min-w-0 lg:border-r lg:border-border lg:pr-4"
                aria-label="Recording list"
              >
                <RecordingList
                  recordings={teamsRecordings}
                  groupDatesBy={teamsRecordingMonthSource}
                  selectedId={selectedTeams?.id ?? null}
                  onSelect={setTeamsId}
                  getLabel={(r) => formatRecordedDate(r.created_datetime)}
                  renderAction={(r) =>
                    canUpload ? (
                      <button
                        type="button"
                        className="shrink-0 rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Copy share link"
                        onClick={(e) => {
                          e.stopPropagation();
                          void copyShareLink("teams", r.id, () => setTeamsId(r.id));
                        }}
                        disabled={sharingId === shareKey("teams", r.id)}
                      >
                        {sharingId === shareKey("teams", r.id) ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : (
                          <ShareAndroid className="h-3.5 w-3.5" />
                        )}
                      </button>
                    ) : null
                  }
                />
              </aside>
              <main className="min-w-0 flex-1 space-y-3">
                <RecordingVideoPlayer
                  source={filePlaybackSource(selectedTeams?.download_url ?? null)}
                />
                {canUpload && selectedTeams && (
                  <ShareRecordingPanel
                    url={shareUrls[shareKey("teams", selectedTeams.id)] ?? null}
                    isLoading={sharingId === shareKey("teams", selectedTeams.id)}
                    isError={shareErrors[shareKey("teams", selectedTeams.id)] ?? false}
                    expiresInDays={shareLinkExpiresInDays}
                    onRetry={() => shareTeamsMutation.mutate(selectedTeams.id)}
                  />
                )}
              </main>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Manual Recordings ─────────────────────────────────────────────── */}
      {user && !isStudent(user) && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Upload className="h-6 w-6" aria-hidden />
                Manual Recordings
              </CardTitle>
              <CardDescription>
                Recordings added manually by staff — uploaded video files or YouTube links.
              </CardDescription>
            </div>
            {canUpload && (
              <Button
                size="sm"
                variant={isAdding ? "secondary" : "primary"}
                className="shrink-0"
                onClick={() => setIsAdding((open) => !open)}
              >
                {isAdding ? (
                  "Cancel"
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Add Recording
                  </>
                )}
              </Button>
            )}
          </CardHeader>

          <CardContent className="space-y-6">
            {isAdding && canUpload && (
              <AddRecordingPanel
                courseId={id}
                onCancel={() => setIsAdding(false)}
                onUploaded={() => {
                  setIsAdding(false);
                  queryClient.invalidateQueries({
                    queryKey: ["user-recordings", id],
                  });
                }}
              />
            )}
            {uploadedQuery.isLoading ? (
              <RecordingPanelSkeleton />
            ) : uploadedRecordings.length === 0 ? (
              <p className="text-text-secondary text-sm py-8 text-center">
                No manual recordings yet.
                {canUpload && " Use Add Recording to upload a file or embed a YouTube link."}
              </p>
            ) : (
              <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
                <aside
                  className="shrink-0 lg:w-72 lg:min-w-0 lg:border-r lg:border-border lg:pr-4"
                  aria-label="Manual recording list"
                >
                  <RecordingList
                    recordings={uploadedRecordings}
                    groupDatesBy={uploadedRecordingMonthSource}
                    selectedId={selectedUploaded?.id ?? null}
                    onSelect={setUploadedId}
                    getLabel={(r) => r.display_label}
                    getSubLabel={(r) =>
                      r.source_type === "youtube" ? "YouTube" : "Uploaded video"
                    }
                    renderAction={(r) => (
                      <div className="flex items-center gap-0.5">
                        {r.source_type === "youtube" && r.youtube_url && (
                          <button
                            type="button"
                            className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-accent hover:text-accent-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
                            aria-label="Copy YouTube link"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(r.youtube_url!);
                              toast.add({ title: "YouTube link copied." });
                            }}
                          >
                            <Youtube className="h-3.5 w-3.5 text-red-500" />
                          </button>
                        )}
                        {canUpload && (
                          <button
                            type="button"
                            className="shrink-0 rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="Copy share link"
                            onClick={(e) => {
                              e.stopPropagation();
                              void copyShareLink("uploaded", r.id, () =>
                                setUploadedId(r.id)
                              );
                            }}
                            disabled={sharingId === shareKey("uploaded", r.id)}
                          >
                            {sharingId === shareKey("uploaded", r.id) ? (
                              <Spinner className="h-3.5 w-3.5" />
                            ) : (
                              <ShareAndroid className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                        {canDelete(r) && (
                          <ConfirmationDialog
                            title="Delete recording?"
                            content="This will permanently remove the recording and its video file."
                            onConfirm={() => deleteMutation.mutate(r.id)}
                            isLoading={deleteMutation.isLoading}
                          >
                            <button
                              type="button"
                              className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
                              aria-label="Delete recording"
                            >
                              <Trash className="h-3.5 w-3.5" />
                            </button>
                          </ConfirmationDialog>
                        )}
                      </div>
                    )}
                  />
                </aside>
                <main className="min-w-0 flex-1 space-y-3">
                  {uploadedUrlLoading ? (
                    <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-surface-hover text-text-secondary">
                      <p className="text-sm">Loading video...</p>
                    </div>
                  ) : uploadedPlaybackSource ? (
                    <RecordingVideoPlayer
                      source={uploadedPlaybackSource}
                      title={selectedUploaded?.display_label}
                      subtitle={
                        selectedUploaded?.description?.trim() ||
                        (selectedUploaded?.source_type === "youtube"
                          ? "YouTube recording"
                          : "Uploaded recording")
                      }
                      emptyLabel="Select a recording to play"
                    />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-surface-hover text-text-secondary">
                      <p className="text-sm text-center px-4">
                        {selectedUploaded
                          ? selectedUploaded.source_type === "file"
                            ? "File is still uploading. Check back shortly."
                            : "Recording unavailable."
                          : "Select a recording to play"}
                      </p>
                    </div>
                  )}
                  {canUpload && selectedUploaded && (
                    <ShareRecordingPanel
                      url={
                        shareUrls[shareKey("uploaded", selectedUploaded.id)] ??
                        null
                      }
                      isLoading={
                        sharingId === shareKey("uploaded", selectedUploaded.id)
                      }
                      isError={
                        shareErrors[shareKey("uploaded", selectedUploaded.id)] ??
                        false
                      }
                      expiresInDays={shareLinkExpiresInDays}
                      onRetry={() =>
                        shareUploadedMutation.mutate(selectedUploaded.id)
                      }
                    />
                  )}
                </main>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </PageContainer>
);
}
