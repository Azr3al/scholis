"use client";

import { PublicProfileView } from "@/components/users/profile/public-profile-view";
import { useParams } from "next/navigation";

export default function PublicProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  return <PublicProfileView slug={slug} />;
}
