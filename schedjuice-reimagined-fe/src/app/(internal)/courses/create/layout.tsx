import { PageContainer } from "@/components/layout/page-container";
import { CreateFlowProvider } from "@/components/scheduling/create-flow-context";
import { CreateFlowChrome } from "@/components/scheduling/create-flow-chrome";
import { CreateFlowPageHeader } from "@/components/scheduling/create-flow-page-header";

export default function CourseCreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CreateFlowProvider>
      <PageContainer width="narrow" className="space-y-6">
        <CreateFlowPageHeader />
        <CreateFlowChrome />
        {children}
      </PageContainer>
    </CreateFlowProvider>
  );
}
