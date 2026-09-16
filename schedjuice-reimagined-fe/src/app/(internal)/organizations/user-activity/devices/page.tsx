"use client";

import {
  bulkRevokeMobileDevices,
  listMobileDevices,
  mobileDevicesQueryKey,
  revokeMobileDevice,
  revokeStaleMobileDevices,
  type MobileDeviceRow,
} from "@/app/client-api/mobile-devices";
import { PageContainer } from "@/components/layout/page-container";
import { PageSection } from "@/components/layout/page-section";
import ConfirmationDialog from "@/components/misc/confirmation-dialog";
import GenericDialog from "@/components/misc/generic-dialog";
import { usePageHeader } from "@/components/shell/use-page-header";
import {
  Button,
  Checkbox,
  Input,
  Select,
  Skeleton,
  useToast,
} from "@/components/primitives";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/reports/report-table";
import {
  canRevokeMobileDevices,
  canViewMobileDevices,
} from "@/helpers/authorization";
import { formatDateTime, formatRelativeTime } from "@/helpers/date";
import { useUser } from "@/hooks/useUser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavArrowLeft, NavArrowRight } from "iconoir-react";
import Link from "next/link";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from "nuqs";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 25;

type StatusFilter = "all" | "active" | "inactive";

function deviceLabel(device: MobileDeviceRow): string {
  const name = device.display_name?.trim();
  if (name) return name;
  const model = device.device_model?.trim();
  if (model) return model;
  return "Unknown device";
}

function osLabel(device: MobileDeviceRow): string {
  const osName = device.os_name?.trim();
  const osVersion = device.os_version?.trim();
  if (osName && osVersion) return `${osName} ${osVersion}`;
  if (osName) return osName;
  if (osVersion) return osVersion;
  return "—";
}

function deviceStatusLabel(device: MobileDeviceRow): string {
  return device.is_active ? "Active" : "Signed out";
}

function isRevokable(device: MobileDeviceRow): boolean {
  return device.is_active;
}

export default function MobileDevicesPage() {
  const { user, isLoading: userLoading } = useUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canRevoke = user ? canRevokeMobileDevices(user) : false;

  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [status, setStatus] = useQueryState(
    "status",
    parseAsStringEnum<StatusFilter>(["all", "active", "inactive"]).withDefault(
      "all",
    ),
  );
  const [userId, setUserId] = useQueryState("user_id", parseAsInteger);
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set<number>(),
  );
  const [staleModalOpen, setStaleModalOpen] = useState(false);
  const [staleDaysInput, setStaleDaysInput] = useState("90");

  useEffect(() => {
    if (!userLoading && user && !canViewMobileDevices(user)) {
      router.replace("/");
    }
  }, [userLoading, user, router]);

  const listFilters = useMemo(
    () => ({
      q: search.trim() || undefined,
      is_active:
        status === "all" ? undefined : status === "active" ? true : false,
      user_id: userId ?? undefined,
      page,
      size: PAGE_SIZE,
    }),
    [page, search, status, userId],
  );

  const devicesQuery = useQuery({
    queryKey: mobileDevicesQueryKey(listFilters),
    queryFn: () => listMobileDevices(listFilters),
    enabled: !!user && canViewMobileDevices(user),
    keepPreviousData: true,
  });

  const devices = devicesQuery.data?.items ?? [];

  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, status, userId, page, devicesQuery.data?.items]);

  const revokableRows = useMemo(
    () => (canRevoke ? devices.filter(isRevokable) : []),
    [canRevoke, devices],
  );

  const allEligibleSelected =
    revokableRows.length > 0 &&
    revokableRows.every((row) => selectedIds.has(row.id));
  const someEligibleSelected = revokableRows.some((row) =>
    selectedIds.has(row.id),
  );
  const selectAllChecked = allEligibleSelected;
  const selectAllIndeterminate =
    someEligibleSelected && !allEligibleSelected;

  const toggleRowSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(
      checked ? new Set(revokableRows.map((row) => row.id)) : new Set(),
    );
  };

  const invalidateDevices = () => {
    void queryClient.invalidateQueries({ queryKey: ["mobile-devices"] });
  };

  const revokeOneMutation = useMutation({
    mutationFn: (deviceId: number) => revokeMobileDevice(deviceId),
    onSuccess: () => {
      toast.add({ title: "Device signed out" });
      invalidateDevices();
    },
    onError: () => {
      toast.add({ title: "Could not sign out device" });
    },
  });

  const bulkRevokeMutation = useMutation({
    mutationFn: (deviceIds: number[]) =>
      bulkRevokeMobileDevices({ device_ids: deviceIds }),
    onSuccess: ({ revoked_count, sessions_revoked }) => {
      setSelectedIds(new Set());
      invalidateDevices();
      if (revoked_count === 0) {
        toast.add({ title: "No devices signed out" });
        return;
      }
      toast.add({
        title:
          revoked_count === 1
            ? "Device signed out"
            : `Signed out ${revoked_count} devices`,
        description:
          sessions_revoked > 0
            ? `${sessions_revoked} session${sessions_revoked === 1 ? "" : "s"} ended`
            : undefined,
      });
    },
    onError: () => {
      toast.add({ title: "Could not sign out selected devices" });
    },
  });

  const revokeStaleMutation = useMutation({
    mutationFn: (inactiveDays: number) =>
      revokeStaleMobileDevices(inactiveDays),
    onSuccess: ({ revoked_count }) => {
      setStaleModalOpen(false);
      invalidateDevices();
      if (revoked_count === 0) {
        toast.add({ title: "No inactive devices matched" });
        return;
      }
      toast.add({
        title:
          revoked_count === 1
            ? "Inactive device signed out"
            : `Signed out ${revoked_count} inactive devices`,
      });
    },
    onError: () => {
      toast.add({ title: "Could not sign out inactive devices" });
    },
  });

  const handleRevokeStale = () => {
    const parsed = Number.parseInt(staleDaysInput, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      toast.add({ title: "Enter at least 1 day" });
      return;
    }
    revokeStaleMutation.mutate(parsed);
  };

  usePageHeader(
    useMemo(
      () => ({
        breadcrumb: (
          <h1 className="font-serif text-lg text-text-primary">
            Mobile devices
          </h1>
        ),
      }),
      [],
    ),
  );

  if (userLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div
          role="status"
          aria-label="Loading"
          className="size-8 animate-spin rounded-full border-2 border-border border-t-text-primary motion-reduce:animate-none"
        />
      </div>
    );
  }

  if (!user || !canViewMobileDevices(user)) {
    return null;
  }

  const totalCount = devicesQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const revokePending =
    revokeOneMutation.isPending ||
    bulkRevokeMutation.isPending ||
    revokeStaleMutation.isPending;

  return (
    <PageContainer width="wide" className="space-y-8">
      <Link
        href="/organizations/user-activity"
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <NavArrowLeft className="size-4 shrink-0" aria-hidden />
        User activity
      </Link>

      <div>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Mobile app sign-ins for people at your school. Sign out a device to
          end its session on the app.
        </p>
      </div>

      <PageSection dominant>
        <div className="space-y-4 border-b border-border pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-medium text-text-primary">
                All mobile devices
              </h2>
              <p className="text-sm text-text-secondary">
                Filter by person, status, or search by name or email.
              </p>
            </div>
            {canRevoke ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setStaleModalOpen(true)}
                disabled={revokePending}
              >
                Sign out inactive devices…
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="min-w-[220px] flex-1 space-y-2">
              <span className="text-sm font-medium text-text-secondary">
                Search
              </span>
              <Input
                value={search}
                onChange={(event) => {
                  void setSearch(event.target.value);
                  void setPage(1);
                }}
                placeholder="Name or email"
              />
            </div>
            <div className="space-y-2 w-[200px]">
              <span className="text-sm font-medium text-text-secondary">
                Status
              </span>
              <Select
                className="w-full"
                value={status}
                onValueChange={(value) => {
                  void setStatus(value as StatusFilter);
                  void setPage(1);
                }}
                items={[
                  { value: "all", label: "All" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Signed out" },
                ]}
              />
            </div>
            {userId != null ? (
              <div className="flex items-end gap-2">
                <p className="text-sm text-text-muted">
                  Filtered to user #{userId}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void setUserId(null);
                    void setPage(1);
                  }}
                >
                  Clear
                </Button>
              </div>
            ) : null}
          </div>

          {devicesQuery.isLoading ? (
            <Skeleton className="h-48 w-full rounded-lg" aria-busy="true" />
          ) : devicesQuery.isError ? (
            <p className="text-sm text-danger" role="alert">
              {devicesQuery.error instanceof Error
                ? devicesQuery.error.message
                : "Failed to load."}
            </p>
          ) : devices.length === 0 ? (
            <p className="rounded-lg border py-8 text-center text-sm text-text-muted">
              No mobile devices match these filters.
            </p>
          ) : (
            <>
              {canRevoke && selectedIds.size > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-hover px-3 py-2">
                  <p className="text-sm text-text-muted">
                    {selectedIds.size} selected
                  </p>
                  <ConfirmationDialog
                    title={`Sign out ${selectedIds.size} device${selectedIds.size === 1 ? "" : "s"}?`}
                    content="These people will need to sign in again on the mobile app."
                    onConfirm={() =>
                      bulkRevokeMutation.mutate(Array.from(selectedIds))
                    }
                    isLoading={bulkRevokeMutation.isPending}
                  >
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={bulkRevokeMutation.isPending}
                      isLoading={bulkRevokeMutation.isPending}
                    >
                      Sign out selected ({selectedIds.size})
                    </Button>
                  </ConfirmationDialog>
                </div>
              ) : null}

              <Table>
                <TableHeader>
                  <TableRow>
                    {canRevoke ? (
                      <TableHead className="w-[1%]">
                        {revokableRows.length > 0 ? (
                          <Checkbox
                            checked={selectAllChecked}
                            indeterminate={selectAllIndeterminate}
                            onCheckedChange={handleSelectAll}
                            disabled={bulkRevokeMutation.isPending}
                            aria-label="Select all on page"
                          />
                        ) : null}
                      </TableHead>
                    ) : null}
                    <TableHead>User</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Last active</TableHead>
                    <TableHead>Status</TableHead>
                    {canRevoke ? (
                      <TableHead className="w-[1%] whitespace-nowrap">
                        Actions
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((device) => (
                    <TableRow key={device.id}>
                      {canRevoke ? (
                        <TableCell>
                          {isRevokable(device) ? (
                            <Checkbox
                              checked={selectedIds.has(device.id)}
                              onCheckedChange={() =>
                                toggleRowSelection(device.id)
                              }
                              disabled={bulkRevokeMutation.isPending}
                              aria-label={`Select ${deviceLabel(device)}`}
                            />
                          ) : null}
                        </TableCell>
                      ) : null}
                      <TableCell>
                        {device.user ? (
                          <Link
                            href={`/users/${device.user.id}?section=access`}
                            className="font-medium text-primary hover:underline"
                          >
                            {device.user.full_name}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {device.user?.email ? (
                          <p className="text-xs text-text-muted">
                            {device.user.email}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>{deviceLabel(device)}</TableCell>
                      <TableCell className="text-text-muted">
                        {osLabel(device)}
                      </TableCell>
                      <TableCell>
                        {device.last_seen_at ? (
                          <span title={formatDateTime(device.last_seen_at)}>
                            {formatRelativeTime(device.last_seen_at)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{deviceStatusLabel(device)}</TableCell>
                      {canRevoke ? (
                        <TableCell>
                          {isRevokable(device) ? (
                            <ConfirmationDialog
                              title="Sign out device?"
                              content={`Sign ${deviceLabel(device)} out of the mobile app.`}
                              onConfirm={() =>
                                revokeOneMutation.mutate(device.id)
                              }
                              isLoading={
                                revokeOneMutation.isPending &&
                                revokeOneMutation.variables === device.id
                              }
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto gap-1.5 px-0 text-danger"
                                isLoading={
                                  revokeOneMutation.isPending &&
                                  revokeOneMutation.variables === device.id
                                }
                                disabled={
                                  revokeOneMutation.isPending &&
                                  revokeOneMutation.variables !== device.id
                                }
                              >
                                Sign out
                              </Button>
                            </ConfirmationDialog>
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between gap-2 pt-2">
                <p className="text-sm text-text-muted">
                  {totalCount.toLocaleString()} total
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => void setPage(Math.max(1, page - 1))}
                  >
                    <NavArrowLeft className="size-4" aria-hidden />
                    Previous
                  </Button>
                  <span className="tabular-nums text-sm text-text-muted">
                    {page} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => void setPage(page + 1)}
                  >
                    Next
                    <NavArrowRight className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </PageSection>

      {canRevoke ? (
        <GenericDialog
          title="Sign out inactive devices"
          open={staleModalOpen}
          onOpenChange={setStaleModalOpen}
          confirmLabel="Sign out inactive devices"
          isLoading={revokeStaleMutation.isPending}
          onConfirm={handleRevokeStale}
          content={
            <div className="space-y-3 py-2">
              <p className="text-sm text-text-secondary">
                Sign out active devices whose last activity is older than the
                threshold below.
              </p>
              <div className="space-y-2">
                <label
                  htmlFor="stale-days"
                  className="text-sm font-medium text-text-secondary"
                >
                  Inactive for at least
                </label>
                <Input
                  id="stale-days"
                  type="number"
                  min={1}
                  value={staleDaysInput}
                  onChange={(event) => setStaleDaysInput(event.target.value)}
                  disabled={revokeStaleMutation.isPending}
                />
                <p className="text-xs text-text-muted">Days (default 90)</p>
              </div>
            </div>
          }
        />
      ) : null}
    </PageContainer>
  );
}
