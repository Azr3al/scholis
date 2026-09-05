import { column, type Column } from "@/components/data-table";
import { Button } from "@/components/primitives";
import type { BuildingCheckin } from "@/sdk";

function formatCheckTime(time?: string | null) {
  if (!time) return null;
  const date = new Date(time);
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function createCampusCheckinColumns(opts: {
  onViewImage: (url: string) => void;
}): Column<BuildingCheckin>[] {
  return [
    column.text<BuildingCheckin>({
      id: "employee_no",
      header: "Employee No",
      accessor: (row) => row.user?.access_log_name,
    }),
    column.text<BuildingCheckin>({
      id: "name",
      header: "Name",
      accessor: (row) => row.user?.name,
    }),
    column.date<BuildingCheckin>({
      id: "date",
      header: "Date",
      accessor: (row) => row.date,
    }),
    column.text<BuildingCheckin>({
      id: "actual_checkin_time",
      header: "Check In Time",
      accessor: (row) => formatCheckTime(row.actual_checkin_time),
    }),
    column.text<BuildingCheckin>({
      id: "actual_checkout_time",
      header: "Check Out Time",
      accessor: (row) => formatCheckTime(row.actual_checkout_time),
    }),
    column.text<BuildingCheckin>({
      id: "campus",
      header: "Campus",
      accessor: (row) => row.campus?.name,
    }),
    column.text<BuildingCheckin>({
      id: "checkin_verification_method",
      header: "Check-in verification",
      accessor: (row) => row.checkin_verification_method,
    }),
    column.text<BuildingCheckin>({
      id: "checkout_verification_method",
      header: "Check-out verification",
      accessor: (row) => row.checkout_verification_method,
    }),
    {
      id: "checkin_image",
      header: "Check-in selfie",
      accessor: (row) => row.checkin_image,
      enableSorting: false,
      cell: ({ row }) => {
        if (!row.checkin_image) return "—";
        return (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => opts.onViewImage(row.checkin_image!)}
          >
            View
          </Button>
        );
      },
    },
    {
      id: "checkout_image",
      header: "Check-out selfie",
      accessor: (row) => row.checkout_image,
      enableSorting: false,
      cell: ({ row }) => {
        if (!row.checkout_image) return "—";
        return (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => opts.onViewImage(row.checkout_image!)}
          >
            View
          </Button>
        );
      },
    },
  ];
}
