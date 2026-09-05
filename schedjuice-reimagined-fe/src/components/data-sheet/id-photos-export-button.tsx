"use client";
import { Button, Dialog, Select, buttonVariants, useToast } from "@/components/primitives";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "iconoir-react";
import { fetchEntities } from "@/app/client-api/utils";
import {
  downloadIdPhotos,
  type IdPhotoAudience,
  type IdPhotoExportFormat,
} from "@/helpers/id-photos-export";

type CategoryOption = { id: number; name: string };

type IdPhotosExportButtonProps = {
  audience: IdPhotoAudience;
};

export function IdPhotosExportButton({ audience }: IdPhotosExportButtonProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<IdPhotoExportFormat>("zip");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [pending, setPending] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ["categories", "id-photo-export"],
    queryFn: async () => {
      const res = await fetchEntities("categories", { all: true, size: 200 });
      return (res.data?.data ?? []) as CategoryOption[];
    },
    enabled: open && audience === "student",
  });

  async function handleDownload() {
    setPending(true);
    try {
      await downloadIdPhotos({
        audience,
        format,
        categoryId:
          audience === "student" && categoryId !== "all"
            ? Number(categoryId)
            : null,
      });
      setOpen(false);
    } catch {
      toast.add({
        title: "Download failed",
        description: "Please try again.",
        type: "error",
      });
    } finally {
      setPending(false);
    }
  }

  const subjectLabel = audience === "student" ? "students" : "staff";

  return (
    <>
      <Button
        type="button"
        variant="secondary" size="sm"
        className="h-9 shrink-0 gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Download className="size-4" aria-hidden />
        Download ID photos
      </Button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="sm:max-w-md">
          <div>
            <Dialog.Title>Download ID photos</Dialog.Title>
            <Dialog.Description>
              Export {subjectLabel} who have an ID photo uploaded. Large schools
              can filter students by course category.
            </Dialog.Description>
          </div>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label htmlFor="id-photo-export-format">Format</label>
              <Select
                value={format}
                onValueChange={(v) => setFormat(v as "zip" | "pdf")}
                className="w-full"
                items={[
                  { value: "zip", label: "ZIP — raw image files" },
                  { value: "pdf", label: "PDF — contact sheet" },
                ]}
              />
            </div>

            {audience === "student" ? (
              <div className="space-y-2">
                <label htmlFor="id-photo-export-category">Course category</label>
                <Select
                  value={categoryId}
                  onValueChange={setCategoryId}
                  className="w-full"
                  placeholder="All categories"
                  items={[
                    { value: "all", label: "All categories" },
                    ...(categoriesQuery.data ?? []).map((cat) => ({
                      value: String(cat.id),
                      label: cat.name,
                    })),
                  ]}
                />
              </div>
            ) : null}
          </div>

          <div>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              isLoading={pending}
              disabled={pending}
              className="gap-2"
              onClick={() => void handleDownload()}
            >
              <Download className="size-4" aria-hidden />
              Download
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
