import { Card, CardContent } from "@/components/public/elevated-card";
import { PageContainer } from "@/components/layout/page-container";
import {
  globalRoutePageWidth,
  resolveGlobalRouteLayout,
} from "@/lib/ui-remediation/r6-global-route-classes";

const PAGE_WIDTH = globalRoutePageWidth(
  resolveGlobalRouteLayout("/(public)/(tnc)/terms"),
);

export default function TnCLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageContainer width={PAGE_WIDTH}>
      <Card className="p-5">
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </PageContainer>
  );
}
