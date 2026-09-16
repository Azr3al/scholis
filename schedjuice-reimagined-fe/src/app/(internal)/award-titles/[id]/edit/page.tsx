"use client";

import { PageContainer } from "@/components/layout/page-container";
import ConfirmationDialog from "@/components/misc/confirmation-dialog";
import {
  Button,
  Field,
  Input,
  Select,
  Skeleton,
  Switch,
  buttonVariants,
  useToast,
} from "@/components/primitives";
import { cn } from "@/lib/utils";
import {
  createAwardCertificate,
  getAwardCertificate,
  getAwardTitle,
  retireAwardTitle,
  updateAwardTitle,
} from "@/lib/awards-api";
import type { AwardFamily } from "@/types/award";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const FAMILY_ITEMS = [
  { value: "none", label: "None" },
  { value: "academic_excellence", label: "Academic excellence" },
  { value: "attendance", label: "Attendance" },
] as const;

const AwardTitleEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const titleId = Number(id);
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [family, setFamily] = useState("none");
  const [pinned, setPinned] = useState(true);

  const title = useQuery({
    queryKey: ["award-titles", titleId],
    queryFn: () => getAwardTitle(titleId),
    enabled: Number.isFinite(titleId),
  });

  useEffect(() => {
    if (!title.data) return;
    setName(title.data.name);
    setFamily(title.data.family ?? "none");
    setPinned(title.data.is_pinned);
  }, [title.data]);

  const save = useMutation({
    mutationFn: () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      return updateAwardTitle(titleId, {
        name: trimmed,
        family: family === "none" ? null : (family as AwardFamily),
        is_pinned: pinned,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["award-titles"] });
      toast.add({ title: "Award title saved." });
    },
    onError: () => {
      toast.add({ type: "error", title: "Could not save award title." });
    },
  });

  const retire = useMutation({
    mutationFn: () => retireAwardTitle(titleId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["award-titles"] });
      toast.add({ title: "Award title retired." });
      router.push("/award-titles");
    },
    onError: () => {
      toast.add({ type: "error", title: "Could not retire award title." });
    },
  });

  return (
    <PageContainer width="narrow" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/award-titles"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "size-9 p-0",
          )}
          aria-label="Back to award titles"
        >
          <NavArrowLeft className="size-4 shrink-0" aria-hidden />
        </Link>
        {title.data && title.data.course == null ? (
          <AwardTitleTemplateAction titleId={titleId} />
        ) : null}
      </div>
      {title.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {title.isError ? (
        <p className="text-sm text-danger">Could not load this award title.</p>
      ) : null}
      {title.data ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <Field.Root>
            <Field.Label>Name</Field.Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>Family</Field.Label>
            <Select
              value={family}
              onValueChange={setFamily}
              items={[...FAMILY_ITEMS]}
            />
          </Field.Root>
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <Switch
              checked={pinned}
              onCheckedChange={(checked) => setPinned(checked === true)}
            />
            Pinned on course pickers
          </label>
          <Button type="submit" isLoading={save.isLoading} disabled={!name.trim()}>
            Save
          </Button>
        </form>
      ) : null}
      {title.data && !title.data.retired_at ? (
        <div className="border-t border-border-subtle pt-4">
          <ConfirmationDialog
            title="Retire this title?"
            content="Existing grants stay on course boards, but teachers can no longer pick it."
            onConfirm={() => retire.mutate()}
            isLoading={retire.isLoading}
          >
            <span
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                "border-warning/40 bg-warning/10 text-warning-foreground hover:bg-warning/15",
              )}
            >
              Retire
            </span>
          </ConfirmationDialog>
        </div>
      ) : null}
    </PageContainer>
  );
};

function AwardTitleTemplateAction({ titleId }: { titleId: number }) {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const certificate = useQuery({
    queryKey: ["award-certificate", titleId],
    queryFn: () => getAwardCertificate(titleId),
    enabled: Number.isFinite(titleId),
  });

  const create = useMutation({
    mutationFn: () => createAwardCertificate(titleId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["award-certificate", titleId] });
      router.push(`/award-titles/${titleId}/certificate`);
    },
    onError: () => {
      toast.add({ type: "error", title: "Could not create template." });
    },
  });

  if (certificate.isLoading) {
    return <Skeleton className="h-8 w-28" />;
  }
  if (certificate.isError) {
    return (
      <p className="text-sm text-danger">Could not load template.</p>
    );
  }

  if (certificate.data) {
    return (
      <Link
        href={`/award-titles/${titleId}/certificate`}
        className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
      >
        Edit template
      </Link>
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      isLoading={create.isLoading}
      onClick={() => create.mutate()}
    >
      Create template
    </Button>
  );
}

export default AwardTitleEditPage;
