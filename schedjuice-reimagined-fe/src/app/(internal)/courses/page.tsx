"use client";

import { AcademicHubPageInner } from "@/components/academic-hub/academic-hub-page";
import {
  AcademicHubProvider,
  useAcademicHubContext,
} from "@/components/academic-hub/academic-hub-context";
import { JoinCodeEntryDialog } from "@/components/academic-hub/join-code-entry-dialog";
import { useAcademicHubPageHeader } from "@/components/academic-hub/use-academic-hub-page-header";
import { PageContainer } from "@/components/layout/page-container";
import { Suspense } from "react";
import { CardGridSkeleton } from "@/components/loading/structured-skeletons";

function CoursesRouteContent() {
  return (
    <AcademicHubProvider>
      <CoursesRouteBody />
    </AcademicHubProvider>
  );
}

function CoursesRouteBody() {
  const { joinCodeDialogOpen, setJoinCodeDialogOpen } = useAcademicHubContext();
  useAcademicHubPageHeader();

  return (
    <>
      <JoinCodeEntryDialog
        open={joinCodeDialogOpen}
        onOpenChange={setJoinCodeDialogOpen}
      />
      <AcademicHubPageInner />
    </>
  );
}

export default function CoursesRoute() {
  return (
    <PageContainer width="wide">
      <Suspense
        fallback={
          <div
            className="space-y-4 px-4 pb-20 pt-4 sm:px-6 lg:px-8"
            aria-busy="true"
          >
            <CardGridSkeleton count={6} cardClassName="min-h-52" />
          </div>
        }
      >
        <CoursesRouteContent />
      </Suspense>
    </PageContainer>
  );
}
