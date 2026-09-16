"use client";

import { useCallback, useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";

import AnnouncementList from "@/components/announcement/announcement-list";
import { AnnouncementCreationCenterForm } from "@/components/announcement/announcement-creation-center-form";
import { searchEntities } from "@/app/client-api/utils";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
import { Button } from "@/components/primitives";
import { crossfade, crossfadeInstant, revealBar } from "@/lib/sj/motion";
import { operatorEnum } from "@/types/api";

export default function AnnouncementCenterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reducedMotion = useReducedMotion();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const query = useInfiniteQuery({
    queryKey: ["announcementList", null],
    queryFn: ({ pageParam }) =>
      searchEntities(
        "announcements",
        {
          page: pageParam,
          size: 6,
          sorts: ["-is_pinned", "-created_at"],
          expand: ["attachments", "created_by"],
        },
        {
          filter_params: [
            {
              field_name: "course",
              operator: operatorEnum.isnull,
              value: "true",
            },
          ],
        },
      ),
    getNextPageParam: (lastPage, pages) =>
      lastPage.data.links.next ? pages.length + 1 : undefined,
  });

  const stripCreateParam = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has("create")) return;
    params.delete("create");
    const next = params.toString();
    router.replace(
      next
        ? `/content/announcement-center?${next}`
        : "/content/announcement-center",
      { scroll: false },
    );
  }, [router, searchParams]);

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setIsCreating(true);
      stripCreateParam();
    }
  }, [searchParams, stripCreateParam]);

  const handleCreateSuccess = () => {
    setIsCreating(false);
    void query.refetch();
  };

  return (
    <PageContainer width="wide" className="flex flex-col gap-6">
      <motion.div
        variants={reducedMotion ? crossfadeInstant : crossfade}
        initial="initial"
        animate="animate"
      >
        <PageHeader
          title="Announcement Center"
          description="Org-wide announcements for staff and students."
          actions={
            !isCreating ? (
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => setIsCreating(true)}
              >
                Create announcement
              </Button>
            ) : null
          }
        />

        <AnimatePresence initial={false}>
          {isCreating ? (
            <motion.div
              key="announcement-composer"
              variants={reducedMotion ? crossfadeInstant : revealBar}
              initial="initial"
              animate="animate"
              exit="exit"
              className="mt-4 overflow-hidden"
              data-slot="page-section-supporting"
            >
              <AnnouncementCreationCenterForm
                cancelHref="/content/announcement-center"
                onCancel={() => setIsCreating(false)}
                onSuccess={handleCreateSuccess}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <PageSection dominant className="mt-2">
          <AnnouncementList
            query={query}
            editingId={editingId}
            onEditIdChange={setEditingId}
          />
        </PageSection>
      </motion.div>
    </PageContainer>
  );
}
