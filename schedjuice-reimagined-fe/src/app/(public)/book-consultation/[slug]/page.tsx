"use client";

import { PublicBookingView } from "@/components/consultation/public/public-booking-view";
import { useParams } from "next/navigation";

export default function BookConsultationPage() {
  const { slug } = useParams<{ slug: string }>();
  return <PublicBookingView slug={slug} />;
}
