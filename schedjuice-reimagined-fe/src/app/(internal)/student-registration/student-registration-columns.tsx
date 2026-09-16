import { column, type Column } from "@/components/data-table";
import ConfirmationDialog from "@/components/misc/confirmation-dialog";
import { Button } from "@/components/primitives";
import { courseJoinRequestStatus } from "@/types/course";
import type { User } from "@/sdk";

export function createStudentRegistrationColumns(opts: {
  isBusy: boolean;
  onApprove: (userId: number) => void;
  onDecline: (userId: number) => void;
}): Column<User>[] {
  return [
    column.text<User>({
      id: "name",
      header: "Name",
      accessor: (row) => row.name,
      sizing: { role: "person" },
    }),
    column.text<User>({
      id: "alternative_name",
      header: "Alternate Name",
      accessor: (row) => row.alternative_name,
      sizing: { role: "person" },
    }),
    column.text<User>({
      id: "email",
      header: "Email",
      accessor: (row) => row.email,
      sizing: { role: "identifier" },
    }),
    column.text<User>({
      id: "code",
      header: "User ID",
      accessor: (row) => row.code,
      sizing: { role: "identifier" },
    }),
    column.text<User>({
      id: "communication_email",
      header: "Communication Email",
      accessor: (row) => row.communication_email,
      sizing: { role: "identifier" },
    }),
    column.status<User>({
      id: "gender",
      header: "Gender",
      accessor: (row) => row.gender,
    }),
    column.text<User>({
      id: "phone_number",
      header: "Phone Number",
      accessor: (row) => row.phone_number,
      sizing: { role: "identifier" },
    }),
    column.date<User>({
      id: "date_of_birth",
      header: "Date of Birth",
      accessor: (row) => row.date_of_birth,
    }),
    {
      id: "requested_courses",
      header: "Requested course",
      accessor: (row) => {
        const requests = row.course_join_requests ?? [];
        const pending = requests.filter(
          (r) => r.status === courseJoinRequestStatus.pending,
        );
        return pending
          .map((r) =>
            typeof r.course === "object" && r.course?.title
              ? r.course.title
              : String(r.course ?? "—"),
          )
          .join(", ");
      },
      enableSorting: false,
      sizing: { role: "prose", wrap: "truncate" },
      cell: ({ row }) => {
        const requests = row.course_join_requests ?? [];
        const pending = requests.filter(
          (r) => r.status === courseJoinRequestStatus.pending,
        );
        if (!pending.length) {
          return <span className="text-text-muted">—</span>;
        }
        return (
          <span>
            {pending
              .map((r) =>
                typeof r.course === "object" && r.course?.title
                  ? r.course.title
                  : String(r.course ?? "—"),
              )
              .join(", ")}
          </span>
        );
      },
    },
    {
      id: "action",
      header: "Action",
      accessor: () => null,
      enableSorting: false,
      sizing: { role: "action" },
      cell: ({ row }) => (
        <div className="flex gap-2">
          <ConfirmationDialog
            onConfirm={() => {
              opts.onApprove(row.id);
            }}
            content="This will activate the student account and approve any pending course join requests."
          >
            <Button isLoading={opts.isBusy} size="sm" type="button">
              Approve
            </Button>
          </ConfirmationDialog>
          <ConfirmationDialog
            onConfirm={() => {
              opts.onDecline(row.id);
            }}
            content="This permanently deletes the pending student account and any associated join requests. This cannot be undone."
          >
            <Button
              isLoading={opts.isBusy}
              size="sm"
              type="button"
              variant="danger"
            >
              Decline
            </Button>
          </ConfirmationDialog>
        </div>
      ),
    },
  ];
}
