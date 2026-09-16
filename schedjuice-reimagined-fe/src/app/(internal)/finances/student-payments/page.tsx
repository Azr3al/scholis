"use client";

import { PageContainer } from "@/components/layout/page-container";
import { ReportSkeleton } from "@/components/loading/structured-skeletons";
import { Suspense } from "react";
import StudentPaymentPage from "./student-payment-page-content";

const StudentPaymentPageSuspence = () => {
  return (
    <PageContainer width="wide">
      <Suspense fallback={<ReportSkeleton tableColumns={8} tableRows={8} />}>
        <StudentPaymentPage />
      </Suspense>
    </PageContainer>
  );
};

export default StudentPaymentPageSuspence;
