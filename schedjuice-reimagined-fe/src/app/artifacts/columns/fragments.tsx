import { Button } from "@/components/primitives";
import { customColumnDef } from "./types";
import { formatDate, formatDateTime } from "@/helpers/date";
import { formatTimeInTenantTimezone } from "@/helpers/timeslot";

export const getBuildingCheckinUserColumns = (): customColumnDef<any, any>[] => [
  {
    accessorKey: "preferred_checkin_time",
    header: "Preferred Check-in Time",
    dataType: "string",
    accessorFn: (row) => {
      if (!row.preferred_checkin_time) return "-";
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return formatTimeInTenantTimezone(row.preferred_checkin_time, userTimezone);
    },
  },
  {
    accessorKey: "preferred_checkout_time",
    header: "Preferred Check-out Time", 
    dataType: "string",
    accessorFn: (row) => {
      if (!row.preferred_checkout_time) return "-";
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return formatTimeInTenantTimezone(row.preferred_checkout_time, userTimezone);
    },
  },
  {
    accessorKey: "access_log_name",
    header: "Access Log Name",
  },
];

export const getCampusCheckinColumns = (options?: {
  onViewImage?: (url: string) => void;
}): customColumnDef<any, any>[] => [
  {
    accessorKey: "user.access_log_name",
    header: "Employee No",
    dataType: "string",
    accessorFn: (row) => row.user?.access_log_name || "-",
  },
  {
    accessorKey: "user.name",
    header: "Name",
    dataType: "string",
    accessorFn: (row) => row.user?.name || "-",
  },
  {
    accessorKey: "date",
    header: "Date",
    dataType: "date",
    accessorFn: (row) => row.date,
  },
  {
    accessorKey: "actual_checkin_time",
    header: "Check In Time",
    dataType: "string",
    accessorFn: (row) => {
      const time = row.actual_checkin_time;
      if (!time) return "-";
      const date = new Date(time);
      return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    },
  },
  {
    accessorKey: "actual_checkout_time",
    header: "Check Out Time",
    dataType: "string",
    accessorFn: (row) => {
      const time = row.actual_checkout_time;
      if (!time) return "-";
      const date = new Date(time);
      return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    },
  },
  {
    accessorKey: "campus.name",
    header: "Campus",
    dataType: "string",
    accessorFn: (row) => row.campus?.name ?? "-",
  },
  {
    accessorKey: "checkin_verification_method",
    header: "Check-in verification",
    dataType: "string",
    accessorFn: (row) => row.checkin_verification_method ?? "-",
  },
  {
    accessorKey: "checkout_verification_method",
    header: "Check-out verification",
    dataType: "string",
    accessorFn: (row) => row.checkout_verification_method ?? "-",
  },
  {
    accessorKey: "checkin_image",
    header: "Check-in selfie",
    isSearchDisabled: true,
    cell: ({ row }) => {
      if (!row.original.checkin_image) {
        return <span className="text-muted-foreground">—</span>;
      }
      if (!options?.onViewImage) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => options.onViewImage!(row.original.checkin_image)}
        >
          View
        </Button>
      );
    },
  },
  {
    accessorKey: "checkout_image",
    header: "Check-out selfie",
    isSearchDisabled: true,
    cell: ({ row }) => {
      if (!row.original.checkout_image) {
        return <span className="text-muted-foreground">—</span>;
      }
      if (!options?.onViewImage) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => options.onViewImage!(row.original.checkout_image)}
        >
          View
        </Button>
      );
    },
  },
];

export const getPayrollUserColumns = (): customColumnDef<any, any>[] => [
  {
    accessorKey: "working_hour_per_month",
    header: "Working Hour Per Month",
    dataType: "number",
  },
  {
    accessorKey: "salary",
    header: "Salary",
    dataType: "number",
  },
  {
    accessorKey: "per_session_rate",
    header: "Per Session Rate",
    dataType: "number",
  },
  {
    accessorKey: "per_hour_rate",
    header: "Per Hour Rate",
    dataType: "number",
  },
];

export const getHrUserColumns = (): customColumnDef<any, any>[] => [
  {
    accessorKey: "contract_expiry_date",
    header: "Contract Expiry Date",
    dataType: "date",
    accessorFn: (row) => (row.contract_expiry_date ? formatDate(row.contract_expiry_date) : "-"),
  },
  {
    accessorKey: "probation_end_date",
    header: "Probation End Date",
    dataType: "date",
    accessorFn: (row) => (row.probation_end_date ? formatDate(row.probation_end_date) : "-"),
  },
  {
    accessorKey: "employment_start_date",
    header: "Employment Start Date",
    dataType: "date",
    accessorFn: (row) => (row.employment_start_date ? formatDate(row.employment_start_date) : "-"),
  },
  {
    accessorKey: "employment_type",
    header: "Employment Type",
    dataType: "select",
  },
];
