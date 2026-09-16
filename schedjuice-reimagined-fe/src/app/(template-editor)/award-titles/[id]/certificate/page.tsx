"use client";

import { AwardEditor } from "@/components/template-editor/award-editor";
import { useParams } from "next/navigation";

export default function AwardTitleCertificatePage() {
  const { id } = useParams<{ id: string }>();
  const titleId = Number(id);
  if (!Number.isFinite(titleId)) return null;
  return <AwardEditor titleId={titleId} />;
}
