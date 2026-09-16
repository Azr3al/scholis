import { redirect } from "next/navigation";

export default function LegacyAnnouncementsCreatePage() {
  redirect("/content/announcement-center?create=1");
}
