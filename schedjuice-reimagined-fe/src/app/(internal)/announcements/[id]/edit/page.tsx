"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** Legacy route — unified edit lives on the announcement detail page. */
export default function AnnouncementEditRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (id) {
      router.replace(`/announcements/${id}`);
    }
  }, [id, router]);

  return null;
}
