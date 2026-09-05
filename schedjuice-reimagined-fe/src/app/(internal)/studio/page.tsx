"use client";

import ConfirmationDialog from "@/components/misc/confirmation-dialog";
import { PageContainer } from "@/components/layout/page-container";
import {
  Button,
  Dialog,
  Field,
  Input,
  Menu,
  Radio,
  RadioGroup,
  buttonVariants,
  useToast,
} from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { usePermissions } from "@/hooks/usePermissions";
import {
  createDocumentTemplate,
  deleteDocumentTemplate,
  duplicateDocumentTemplate,
  listDocumentTemplates,
  promoteDocumentTemplate,
} from "@/lib/documents-api";
import { listAwardTitles } from "@/lib/awards-api";
import type {
  DocumentTemplate,
  DocumentTemplateScope,
} from "@/lib/document-template/types";
import { cn } from "@/lib/utils";
import { formatAwardFamily, type AwardTitle } from "@/types/award";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHoriz } from "iconoir-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

function statusLabel(status: DocumentTemplate["status"]): string {
  return status === "published" ? "Published" : "Draft";
}

function formatUpdated(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function originLabel(origin: AwardTitle["origin"]): string {
  if (origin === "admin") return "Admin";
  if (origin === "promoted") return "Promoted";
  return "Local";
}

const StudioPage: React.FC = () => {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { canAny } = usePermissions();
  const canDocuments = canAny(["document_template.manage"]);
  const canAwards = canAny(["award_title.manage"]);
  const [newOpen, setNewOpen] = useState(false);
  const [scope, setScope] = useState<DocumentTemplateScope>("org");
  const [name, setName] = useState("");

  const list = useQuery({
    queryKey: ["document-templates"],
    queryFn: listDocumentTemplates,
    enabled: canDocuments,
  });

  const awards = useQuery({
    queryKey: ["award-titles"],
    queryFn: listAwardTitles,
    enabled: canAwards,
  });

  const create = useMutation({
    mutationFn: () => createDocumentTemplate({ scope, name }),
    onSuccess: (template) => {
      void qc.invalidateQueries({ queryKey: ["document-templates"] });
      setNewOpen(false);
      setName("");
      setScope("org");
      router.push(`/templates/document/${template.id}`);
    },
    onError: () => {
      toast.add({ type: "error", title: "Could not create document." });
    },
  });

  const duplicate = useMutation({
    mutationFn: (id: number) => duplicateDocumentTemplate(id),
    onSuccess: (template) => {
      void qc.invalidateQueries({ queryKey: ["document-templates"] });
      router.push(`/templates/document/${template.id}`);
    },
    onError: () => {
      toast.add({ type: "error", title: "Could not duplicate document." });
    },
  });

  const promote = useMutation({
    mutationFn: (id: number) => promoteDocumentTemplate(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["document-templates"] });
      toast.add({ title: "Promoted to org templates." });
    },
    onError: () => {
      toast.add({ type: "error", title: "Could not promote document." });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteDocumentTemplate(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["document-templates"] });
      toast.add({ title: "Document deleted." });
    },
    onError: () => {
      toast.add({ type: "error", title: "Could not delete document." });
    },
  });

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Documents</h1>
      ),
      actions: (
        <div className="flex gap-2">
          {canDocuments ? (
            <Button size="sm" onClick={() => setNewOpen(true)}>
              New
            </Button>
          ) : null}
          {canAwards ? (
            <Link href="/award-titles/create">
              <Button size="sm" variant="secondary">
                Create award title
              </Button>
            </Link>
          ) : null}
        </div>
      ),
    }),
    [canAwards, canDocuments],
  );
  usePageHeader(headerConfig);

  const rows = list.data ?? [];
  const orgRows = rows.filter((row) => row.scope === "org");
  const myRows = rows.filter((row) => row.scope === "user");
  const awardRows = awards.data ?? [];

  return (
    <PageContainer width="wide" className="space-y-8">
      {canDocuments ? (
        <section className="space-y-8">
          <h2 className="font-serif text-lg text-text-primary">Documents</h2>
          {list.isError ? (
            <p className="text-sm text-danger">Could not load documents.</p>
          ) : null}
          <TemplateSection
            title="Org templates"
            rows={orgRows}
            loading={list.isLoading}
            empty="No org templates yet."
            onDuplicate={(id) => duplicate.mutate(id)}
            onDelete={(id) => remove.mutate(id)}
          />
          <TemplateSection
            title="My templates"
            rows={myRows}
            loading={list.isLoading}
            empty="No private templates yet."
            onPromote={(id) => promote.mutate(id)}
            onDelete={(id) => remove.mutate(id)}
          />
          <Dialog.Root open={newOpen} onOpenChange={setNewOpen}>
            <Dialog.Portal>
              <Dialog.Backdrop />
              <Dialog.Popup>
                <Dialog.Title>New document</Dialog.Title>
                <form
                  className="mt-4 flex flex-col gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    create.mutate();
                  }}
                >
                  <Field.Root>
                    <Field.Label>Visibility</Field.Label>
                    <RadioGroup
                      value={scope}
                      onValueChange={(value) =>
                        setScope(value === "user" ? "user" : "org")
                      }
                    >
                      <label className="flex items-center gap-2 text-sm text-text-primary">
                        <Radio value="org" />
                        Organization
                      </label>
                      <label className="flex items-center gap-2 text-sm text-text-primary">
                        <Radio value="user" />
                        Private
                      </label>
                    </RadioGroup>
                  </Field.Root>
                  <Field.Root>
                    <Field.Label>Name (optional)</Field.Label>
                    <Input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Untitled"
                    />
                  </Field.Root>
                  <div className="flex justify-end gap-2">
                    <Dialog.Close
                      render={<Button type="button" variant="secondary" />}
                    >
                      Cancel
                    </Dialog.Close>
                    <Button type="submit" isLoading={create.isLoading}>
                      Create
                    </Button>
                  </div>
                </form>
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
        </section>
      ) : null}
      {canAwards ? (
        <section className="space-y-3">
          <h2 className="font-serif text-lg text-text-primary">Award titles</h2>
          {awards.isError ? (
            <p className="text-sm text-danger">Could not load award titles.</p>
          ) : null}
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left">
                  <th className="whitespace-nowrap px-3 py-2 text-xs font-medium text-text-muted">
                    Name
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-xs font-medium text-text-muted">
                    Family
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-xs font-medium text-text-muted">
                    Pinned
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-xs font-medium text-text-muted">
                    Origin
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-xs font-medium text-text-muted">
                    Retired
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-xs font-medium text-text-muted">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {awards.isLoading ? (
                  <tr>
                    <td className="px-3 py-6 text-text-muted" colSpan={6}>
                      Loading…
                    </td>
                  </tr>
                ) : awardRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-text-muted" colSpan={6}>
                      No award titles yet.
                    </td>
                  </tr>
                ) : (
                  awardRows.map((row) => (
                    <tr key={row.id} className="border-b border-border-subtle">
                      <td className="px-3 py-2 align-middle font-medium text-text-primary">
                        {row.name}
                      </td>
                      <td className="px-3 py-2 align-middle text-text-secondary">
                        {formatAwardFamily(row.family)}
                      </td>
                      <td className="px-3 py-2 align-middle text-text-secondary">
                        {row.is_pinned ? "Yes" : "No"}
                      </td>
                      <td className="px-3 py-2 align-middle text-text-secondary">
                        {originLabel(row.origin)}
                      </td>
                      <td className="px-3 py-2 align-middle text-text-secondary">
                        {row.retired_at ? "Retired" : "Active"}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <Link
                          href={`/award-titles/${row.id}/edit`}
                          className={cn(
                            buttonVariants({ variant: "secondary", size: "sm" }),
                          )}
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </PageContainer>
  );
};

function TemplateSection({
  title,
  rows,
  loading,
  empty,
  onDuplicate,
  onPromote,
  onDelete,
}: {
  title: string;
  rows: DocumentTemplate[];
  loading: boolean;
  empty: string;
  onDuplicate?: (id: number) => void;
  onPromote?: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-text-primary">{title}</h2>
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left">
              <th className="whitespace-nowrap px-3 py-2 text-xs font-medium text-text-muted">
                Name
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-xs font-medium text-text-muted">
                Status
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-xs font-medium text-text-muted">
                Updated
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-xs font-medium text-text-muted">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-6 text-text-muted" colSpan={4}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-text-muted" colSpan={4}>
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-border-subtle">
                  <td className="px-3 py-2 align-middle font-medium text-text-primary">
                    <Link
                      href={`/templates/document/${row.id}`}
                      className="hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 align-middle text-text-secondary">
                    {statusLabel(row.status)}
                  </td>
                  <td className="px-3 py-2 align-middle text-text-secondary">
                    {formatUpdated(row.updated_at)}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <RowMenu
                      row={row}
                      onDuplicate={onDuplicate}
                      onPromote={onPromote}
                      onDelete={onDelete}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RowMenu({
  row,
  onDuplicate,
  onPromote,
  onDelete,
}: {
  row: DocumentTemplate;
  onDuplicate?: (id: number) => void;
  onPromote?: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="inline-flex size-8 items-center justify-center rounded-md text-text-secondary outline-none hover:bg-surface-hover"
        aria-label={`Actions for ${row.name}`}
      >
        <MoreHoriz width={16} height={16} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end">
          <Menu.Popup>
            <Menu.Item render={<Link href={`/templates/document/${row.id}`} />}>
              Edit
            </Menu.Item>
            {onDuplicate ? (
              <Menu.Item onClick={() => onDuplicate(row.id)}>
                Duplicate to mine
              </Menu.Item>
            ) : null}
            {onPromote ? (
              <Menu.Item onClick={() => onPromote(row.id)}>
                Promote to org
              </Menu.Item>
            ) : null}
            <ConfirmationDialog
              title="Delete this document?"
              content="This cannot be undone."
              onConfirm={() => onDelete(row.id)}
            >
              <button
                type="button"
                className="flex w-full cursor-pointer px-3 py-1.5 text-left text-sm text-danger"
              >
                Delete
              </button>
            </ConfirmationDialog>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export default StudioPage;
