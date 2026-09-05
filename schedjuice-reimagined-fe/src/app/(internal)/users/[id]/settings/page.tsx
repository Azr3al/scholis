import { redirect } from "next/navigation";

export default async function UserSettingsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const pane =
    "change-password" in resolvedSearchParams
      ? "password"
      : "appearance" in resolvedSearchParams
        ? "appearance"
        : "appearance";
  redirect(`/users/${id}?section=settings&pane=${pane}`);
}
