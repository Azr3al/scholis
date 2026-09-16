import { redirect } from "next/navigation";

export default function AnnouncementCenterCreateRedirectPage() {
  redirect("/content/announcement-center?create=1");
}
