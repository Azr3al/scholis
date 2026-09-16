"use client";

import {
  listUserMobileDevices,
  revokeMobileDevice,
  userMobileDevicesQueryKey,
  type MobileDeviceRow,
} from "@/app/client-api/mobile-devices";
import ConfirmationDialog from "@/components/misc/confirmation-dialog";
import { Button, Skeleton, useToast } from "@/components/primitives";
import { RecordSection } from "@/components/record/record-section";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/reports/report-table";
import { formatDateTime, formatRelativeTime } from "@/helpers/date";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

function deviceLabel(device: MobileDeviceRow): string {
  const name = device.display_name?.trim();
  if (name) return name;
  const model = device.device_model?.trim();
  if (model) return model;
  return "Unknown device";
}

function deviceStatusLabel(device: MobileDeviceRow): string {
  return device.is_active ? "Active" : "Signed out";
}

function MobileDeviceRevokeButton({
  device,
  userId,
}: {
  device: MobileDeviceRow;
  userId: number;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const queryKey = userMobileDevicesQueryKey(userId);

  const revoke = useMutation({
    mutationFn: () => revokeMobileDevice(device.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      toast.add({ title: "Device signed out" });
    },
    onError: () => {
      toast.add({ title: "Could not sign out device" });
    },
  });

  return (
    <ConfirmationDialog
      title="Sign out device?"
      content={`Sign ${deviceLabel(device)} out of the mobile app.`}
      isLoading={revoke.isPending}
      onConfirm={() => revoke.mutate()}
    >
      <Button
        type="button"
        variant="danger"
        size="sm"
        isLoading={revoke.isPending}
        disabled={revoke.isPending}
      >
        Sign out
      </Button>
    </ConfirmationDialog>
  );
}

export function MobileDevicesCard({
  userId,
  canRevoke,
}: {
  userId: number;
  canRevoke: boolean;
}) {
  const queryKey = userMobileDevicesQueryKey(userId);
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => listUserMobileDevices(userId),
  });

  const devices = data?.items ?? [];
  const devicesPageHref = `/organizations/user-activity/devices?user_id=${userId}`;

  return (
    <RecordSection
      title="Mobile devices"
      action={
        <Link
          href={devicesPageHref}
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          View all mobile devices
        </Link>
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}

      {!isLoading && isError ? (
        <p className="text-sm text-muted-foreground">
          Could not load mobile devices.
        </p>
      ) : null}

      {!isLoading && !isError && devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No mobile devices.</p>
      ) : null}

      {!isLoading && !isError && devices.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>Last active</TableHead>
              <TableHead>Status</TableHead>
              {canRevoke ? <TableHead className="w-[1%]" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.map((device) => (
              <TableRow key={device.id}>
                <TableCell>{deviceLabel(device)}</TableCell>
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
                    {device.is_active ? (
                      <MobileDeviceRevokeButton
                        device={device}
                        userId={userId}
                      />
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </RecordSection>
  );
}
