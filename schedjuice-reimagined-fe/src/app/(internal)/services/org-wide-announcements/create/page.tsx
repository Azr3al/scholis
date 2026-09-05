import { redirect } from "next/navigation";

export default function LegacyOrgWideAnnouncementsCreatePage() {
  redirect("/content/announcement-center?create=1");
}
