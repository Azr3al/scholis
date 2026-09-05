"use client";

import { bindAwardPreview } from "@/lib/image-template/bind-award-preview";
import { composite } from "@/lib/image-template/composite";
import type { AwardDisplayTemplate } from "@/types/award";
import { useEffect, useState } from "react";
import { awardDocumentFromTemplate } from "@/lib/awards/award-document";

export function AwardCertificateThumb({
  studentName,
  courseName,
  titleName,
  template,
  awardImageUrl = null,
  mtName = "",
  mtSignatureUrl = null,
  onOpen,
}: {
  studentName: string;
  courseName: string;
  titleName: string;
  template: AwardDisplayTemplate;
  awardImageUrl?: string | null;
  mtName?: string;
  mtSignatureUrl?: string | null;
  onOpen: (url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void composite(
      awardDocumentFromTemplate(template),
      bindAwardPreview({
        studentName,
        courseName,
        awardTitle: titleName,
        awardImageUrl,
        mtName,
        mtSignatureUrl,
      }),
    )
      .then((canvas) => {
        if (cancelled) return;
        setUrl(canvas.toDataURL("image/png"));
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [studentName, courseName, titleName, template, awardImageUrl, mtName, mtSignatureUrl]);

  if (!url) {
    return (
      <div
        className="flex min-h-32 items-center justify-center rounded-md bg-surface-sunken/40"
        aria-busy
      />
    );
  }

  return (
    <button
      type="button"
      className="block w-full cursor-zoom-in rounded-md bg-surface-sunken/40 p-2"
      onClick={() => onOpen(url)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`${studentName} ${titleName}`}
        className="mx-auto max-h-36 w-auto object-contain"
      />
    </button>
  );
}
