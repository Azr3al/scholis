"use client";

import { Skeleton } from "@/components/primitives";
import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity } from "@/app/client-api/utils";
import AnnouncementCard from "@/components/announcement/announcement-card";
import AnnouncementForm, {
  FormMode,
} from "@/components/announcement/announcement-form";
import { usePageHeader } from "@/components/shell/use-page-header";
import { crossfade, crossfadeInstant } from "@/lib/sj/motion";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

const AnnouncementDetailsPage = () => {
  const reducedMotion = useReducedMotion();
  const [isEditing, setIsEditing] = useState(false);
  const { id } = useParams<{ id: string }>();
  const { data: announcementData, isLoading } = useQuery({
    queryKey: ["getAnnouncement", id],
    queryFn: () => fetchEntity("announcements", id, ["attachments", "created_by"]),
  });

  const announcement = announcementData?.data.data;
  const title = announcement?.title;

  const pageHeaderConfig = useMemo(
    () => ({
      breadcrumb: (
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1.5 text-sm"
        >
          <Link
            href="/content/announcement-center"
            className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
          >
            Announcement Center
          </Link>
          {title ? (
            <>
              <span className="shrink-0 text-text-muted" aria-hidden>
                /
              </span>
              <span className="truncate font-serif text-lg text-text-primary">
                {title}
              </span>
            </>
          ) : null}
        </nav>
      ),
    }),
    [title],
  );
  usePageHeader(pageHeaderConfig);

  return (
    <PageContainer width="default">
      <motion.div
        variants={reducedMotion ? crossfadeInstant : crossfade}
        initial="initial"
        animate="animate"
        className="min-h-[20rem]"
        aria-busy={isLoading}
      >
        {isLoading ? (
          <Skeleton className="h-80 w-full" />
        ) : announcement ? (
          <AnimatePresence mode="wait" initial={false}>
            {isEditing ? (
              <motion.div
                key="edit"
                variants={reducedMotion ? crossfadeInstant : crossfade}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <AnnouncementForm
                  formMode={FormMode.EDIT}
                  announcement={announcement}
                  onCancel={() => setIsEditing(false)}
                  announcementId={id}
                />
              </motion.div>
            ) : (
              <motion.div
                key="view"
                variants={reducedMotion ? crossfadeInstant : crossfade}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <AnnouncementCard
                  {...announcement}
                  setIsEditInfo={({ isEdit }) => {
                    setIsEditing(Boolean(isEdit));
                  }}
                  announcementId={id}
                  deleteCustomFunction={() => {
                    window.location.href = "/content/announcement-center";
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        ) : null}
      </motion.div>
    </PageContainer>
  );
};

export default AnnouncementDetailsPage;
