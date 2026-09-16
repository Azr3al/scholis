import { redirect } from "next/navigation";

export default async function LegacyResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/courses/${id}/grading/mark-sheets`);
}
