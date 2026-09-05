"use client";

import { ImageLightbox } from "@/components/images/image-lightbox";
import { Button } from "@/components/primitives";
import { fetchCustomFieldAttachmentDownloadUrl } from "@/lib/custom-fields/attachment-api";
import {
  isImageDetailRow,
  parseAttachmentDetailRows,
  type AttachmentDetailRow,
} from "@/lib/custom-fields/attachment-field-state";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";

export function AttachmentDetailValue({ value }: { value: unknown }) {
  const rows = parseAttachmentDetailRows(value);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [urlById, setUrlById] = useState<Record<number, string>>({});
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");

  useEffect(() => {
    const imageRows = parseAttachmentDetailRows(value).filter(isImageDetailRow);
    if (imageRows.length === 0) return;

    let cancelled = false;

    void (async () => {
      const results = await Promise.all(
        imageRows.map(async (row) => {
          const url = await fetchCustomFieldAttachmentDownloadUrl(row.id);
          return url ? ([row.id, url] as const) : null;
        }),
      );

      if (cancelled) return;

      setUrlById((prev) => {
        const next = { ...prev };
        for (const entry of results) {
          if (entry) next[entry[0]] = entry[1];
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [value]);

  const openInNewTab = useCallback(async (row: AttachmentDetailRow) => {
    setLoadingId(row.id);
    try {
      const cached = urlById[row.id];
      const url =
        cached ?? (await fetchCustomFieldAttachmentDownloadUrl(row.id));
      if (url) {
        if (!cached) {
          setUrlById((prev) => ({ ...prev, [row.id]: url }));
        }
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } finally {
      setLoadingId(null);
    }
  }, [urlById]);

  const openImagePreview = useCallback(
    async (row: AttachmentDetailRow) => {
      setLoadingId(row.id);
      try {
        const cached = urlById[row.id];
        const url =
          cached ?? (await fetchCustomFieldAttachmentDownloadUrl(row.id));
        if (!url) {
          await openInNewTab(row);
          return;
        }
        if (!cached) {
          setUrlById((prev) => ({ ...prev, [row.id]: url }));
        }
        setPreviewTitle(row.filename);
        setPreviewImageUrl(url);
      } finally {
        setLoadingId(null);
      }
    },
    [openInNewTab, urlById],
  );

  if (rows.length === 0) return <>—</>;

  return (
    <>
      <ul className="space-y-2">
        {rows.map((row) => {
          const isImage = isImageDetailRow(row);
          const thumbnailUrl = urlById[row.id];
          const isLoading = loadingId === row.id;

          if (isImage) {
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full min-w-0 items-center gap-2 rounded-md text-left text-sm",
                    "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isLoading && "opacity-60",
                  )}
                  disabled={isLoading}
                  onClick={() => void openImagePreview(row)}
                >
                  {thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbnailUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="h-10 w-10 shrink-0 rounded bg-muted"
                    />
                  )}
                  <span className="min-w-0 truncate">{row.filename}</span>
                </button>
              </li>
            );
          }

          return (
            <li key={row.id}>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-sm"
                disabled={isLoading}
                onClick={() => void openInNewTab(row)}
              >
                {row.filename}
              </Button>
            </li>
          );
        })}
      </ul>

      <ImageLightbox
        imageUrl={previewImageUrl}
        title={previewTitle}
        onClose={() => {
          setPreviewImageUrl(null);
          setPreviewTitle("");
        }}
      />
    </>
  );
}
