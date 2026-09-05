"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "iconoir-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button, Checkbox, Input, useToast } from "@/components/primitives";
import { fetchEntity, searchEntities } from "@/app/client-api/utils";
import { useTenant } from "@/hooks/useTenant";
import { buildIdCard } from "@/lib/id-card/build-id-card";
import { buildVerifyUrl } from "@/lib/id-card/verify-url";
import { generateQrDataUrl } from "@/lib/id-card/qr";
import {
  downloadBulkCardsPdf,
  type BulkCardInput,
} from "@/helpers/id-card-export";
import { getActiveIdCardTemplateForRole } from "@/lib/id-card/active-template";
import type { accountType } from "@/types/user";

export default function BulkIdCardPage() {
  const { tenant } = useTenant();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<number, accountType>>({});
  const [generating, setGenerating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["id-card-bulk-users", search],
    queryFn: () => searchEntities("users", { q: search, size: 50 }),
  });

  const users = useMemo(
    () => (data?.data?.data ?? []) as accountType[],
    [data],
  );
  const selectedList = Object.values(selected);

  function toggle(user: accountType) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[user.id]) delete next[user.id];
      else next[user.id] = user;
      return next;
    });
  }

  async function generate() {
    if (!tenant || selectedList.length === 0) return;
    setGenerating(true);
    try {
      const items: BulkCardInput[] = [];
      for (const summary of selectedList) {
        const res = await fetchEntity("users", summary.id);
        const account = res.data.data as accountType;
        const vm = buildIdCard(account, tenant);
        const url = buildVerifyUrl(window.location.origin, vm);
        const qrDataUrl = await generateQrDataUrl(url);
        const template = getActiveIdCardTemplateForRole(tenant, vm.role);
        items.push({ vm, qrDataUrl, template });
      }
      await downloadBulkCardsPdf(items);
    } catch {
      toast.add({
        title: "Generation failed",
        description: "Please try again.",
      });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <PageContainer>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
              Print ID cards
            </h1>
            <p className="text-sm text-text-secondary">
              Select people, then download a print sheet.
            </p>
          </div>
          <Button
            isLoading={generating}
            disabled={selectedList.length === 0 || generating}
            onClick={generate}
          >
            <Download className="size-4" aria-hidden />
            {`Download (${selectedList.length})`}
          </Button>
        </div>

        <Input
          placeholder="Search people"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div
          className="divide-y divide-border rounded-xl border border-border"
          aria-busy={isLoading}
        >
          {users.map((user) => (
            <label
              key={user.id}
              className="flex cursor-pointer items-center gap-3 px-4 py-3"
            >
              <Checkbox
                checked={Boolean(selected[user.id])}
                onCheckedChange={() => toggle(user)}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-text-primary">
                  {user.name}
                </span>
                <span className="truncate text-xs text-text-muted">
                  {user.email}
                </span>
              </span>
            </label>
          ))}
          {!isLoading && users.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-text-muted">
              No people found.
            </p>
          ) : null}
        </div>
      </div>
    </PageContainer>
  );
}
