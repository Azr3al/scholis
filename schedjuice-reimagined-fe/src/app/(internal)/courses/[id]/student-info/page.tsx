import { redirect } from "next/navigation";

export default async function CourseStudentInfoIndexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/courses/${id}/student-info/profile`);
}
