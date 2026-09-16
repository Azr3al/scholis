import { redirect } from "next/navigation";

type ManagementReportsRedirectProps = {
  params: Promise<{ slug?: string[] }>;
};

export default async function ManagementReportsRedirect({
  params,
}: ManagementReportsRedirectProps) {
  const { slug } = await params;
  const path = slug?.length ? `/${slug.join("/")}` : "";
  redirect(`/finances/reports${path}`);
}
