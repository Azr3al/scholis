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
  createAwardTemplate,
  deleteAwardTemplate,
  getAwardTitle,
  listAwardTemplates,
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
        <ConfirmationDialog
          title="Retire this title?"
          content="Existing grants stay on course boards, but teachers can no longer pick it."
          onConfirm={() => retire.mutate()}
          isLoading={retire.isLoading}
        >
          <Button variant="secondary">Retire</Button>
        </ConfirmationDialog>
      ) : null}
      {title.data && title.data.course == null ? (
        <AwardTitleTemplates titleId={titleId} />
      ) : null}
    </PageContainer>
  );
};

function AwardTitleTemplates({ titleId }: { titleId: number }) {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["award-templates", titleId],
    queryFn: () => listAwardTemplates(titleId),
    enabled: Number.isFinite(titleId),
  });

  const create = useMutation({
    mutationFn: () => createAwardTemplate(titleId),
    onSuccess: (template) => {
      void qc.invalidateQueries({ queryKey: ["award-templates", titleId] });
      router.push(`/templates/award/${template.id}`);
    },
    onError: () => {
      toast.add({ type: "error", title: "Could not create template." });
    },
  });

  const remove = useMutation({
    mutationFn: (templateId: number) => deleteAwardTemplate(templateId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["award-templates", titleId] });
      toast.add({ title: "Template deleted." });
    },
    onError: () => {
      toast.add({ type: "error", title: "Could not delete template." });
    },
  });

  const rows = list.data ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-text-primary">Templates</h2>
        <Button
          type="button"
          size="sm"
          isLoading={create.isLoading}
          onClick={() => create.mutate()}
        >
          New
        </Button>
      </div>
      {list.isError ? (
        <p className="text-sm text-danger">Could not load templates.</p>
      ) : null}
      {list.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {!list.isLoading && rows.length === 0 ? (
        <p className="text-sm text-text-muted">No templates yet.</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="divide-y divide-border-subtle rounded-lg border border-border">
          {rows.map((template) => (
            <li
              key={template.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="truncate text-sm text-text-primary">
                {template.name}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/templates/award/${template.id}`}
                  className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                >
                  Edit
                </Link>
                <ConfirmationDialog
                  title="Delete this template?"
                  content="This cannot be undone."
                  onConfirm={() => remove.mutate(template.id)}
                  isLoading={remove.isLoading}
                >
                  <Button variant="danger" size="sm">
                    Delete
                  </Button>
                </ConfirmationDialog>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default AwardTitleEditPage;
