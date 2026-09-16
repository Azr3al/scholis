"use client";

import { Skeleton } from "@/components/primitives";
import {
  AsyncContentPanel,
  AsyncContentPanelRow,
} from "@/components/loading/async-content-panel";
import { EmptyCopy, EmptyState, EMPTY_COPY_PRESETS } from "@/components/primitives/empty";
import { UseInfiniteQueryResult } from "@tanstack/react-query";
import { AxiosResponse } from "axios";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import { crossfade, crossfadeInstant } from "@/lib/sj/motion";
import type { AnnouncementRow } from "@/components/feed";

import AnnouncementCard from "./announcement-card";
import AnnouncementForm, { FormMode } from "./announcement-form";

type AnnouncementListPage = AxiosResponse<{
  data: AnnouncementRow[];
  links?: { next?: string };
}>;

interface AnnouncementListProps {
  courseId?: number;
  query: UseInfiniteQueryResult<AnnouncementListPage, unknown>;
  editingId: number | null;
  onEditIdChange: (id: number | null) => void;
}

function AnnouncementListSkeleton() {
  return (
    <div className="space-y-6 py-2" aria-hidden>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-3/4 max-w-sm" />
            <Skeleton className="min-h-[4rem] w-full rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

const AnnouncementList: React.FC<AnnouncementListProps> = ({
  query,
  courseId,
  editingId,
  onEditIdChange,
}) => {
  const reducedMotion = useReducedMotion();
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const { data, fetchNextPage, hasNextPage, isFetching, isLoading, isError } =
    query;

  const announcements = useMemo(
    () => data?.pages.flatMap((page) => page?.data?.data ?? []) ?? [],
    [data],
  );

  const firstPageCount = data?.pages[0]?.data?.data?.length ?? 0;
  const isInitialLoad = isLoading && announcements.length === 0;

  const panelState = isError
    ? "error"
    : isInitialLoad
      ? "loading"
      : announcements.length === 0
        ? "empty"
        : "ready";

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        fetchNextPage();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage]);

  return (
    <AsyncContentPanel
      state={panelState}
      ariaBusy={isFetching}
      className="border-0 bg-transparent"
      loading={<AnnouncementListSkeleton />}
      empty={
        <EmptyState>
          <EmptyCopy {...EMPTY_COPY_PRESETS.noAnnouncements} />
        </EmptyState>
      }
      error="Could not load announcements."
      staggerResults={firstPageCount > 0}
    >
      <div className="divide-y divide-border" role="list">
        {announcements.map((p, index) => {
          const id = Number(p.id);
          const isEditing = editingId === id;
          const isFirstPage = index < firstPageCount;

          const content = (
            <div className="py-6 first:pt-0" role="listitem">
              <AnimatePresence mode="wait" initial={false}>
                {isEditing ? (
                  <motion.div
                    key={`${id}-edit`}
                    variants={reducedMotion ? crossfadeInstant : crossfade}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <AnnouncementForm
                      formMode={FormMode.EDIT}
                      announcement={p as never}
                      courseId={courseId}
                      onCancel={() => onEditIdChange(null)}
                      announcementId={String(id)}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key={`${id}-view`}
                    variants={reducedMotion ? crossfadeInstant : crossfade}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <AnnouncementCard
                      {...p}
                      setIsEditInfo={({ isEdit, toEditId }) => {
                        if (isEdit && toEditId != null) {
                          onEditIdChange(toEditId);
                        } else {
                          onEditIdChange(null);
                        }
                      }}
                      announcementId={String(id)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );

          if (isFirstPage && firstPageCount > 0) {
            return (
              <AsyncContentPanelRow key={id}>{content}</AsyncContentPanelRow>
            );
          }
          return <div key={id}>{content}</div>;
        })}
      </div>
      {hasNextPage && isFetching ? (
        <div className="py-4">
          <AnnouncementListSkeleton />
        </div>
      ) : null}
      <span ref={sentinelRef} className="block h-px w-full" aria-hidden />
    </AsyncContentPanel>
  );
};

export default AnnouncementList;
