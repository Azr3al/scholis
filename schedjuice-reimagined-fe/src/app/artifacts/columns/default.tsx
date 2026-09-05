import StatusBadge from "@/components/course/status-badge";
import { PrimaryTeacherLine } from "@/components/course/primary-teacher-line";
import { GradingStatusBadge } from "@/components/misc/grading-status-badge";
import InlineInput from "@/components/datatable/inline-input";

import { Badge } from "@/app/_chrome/badge";
import {
  formatDate,
  formatDateTime,
  formatTime,
  formatExamIntakeMonth,
  formatSessionClock,
} from "@/helpers/date";
import { renderCategorySelectSearch } from "@/helpers/fieldRenderers";
import { formatUserScore } from "@/helpers/formatters";
import { getSortableHeader } from "@/helpers/table";
import { cn } from "@/lib/utils";
import { JoinRequestButtons } from "@/components/course/join-request-buttons";
import { ColumnStrategyType, customColumnDef } from "./types";
import { ArtifactType } from "../types";
import {
  DEFAULT_TENANT_CURRENCY_SYMBOL,
  formatMoney,
} from "@/helpers/money";

const baseColumns: { [key: string]: customColumnDef<any, any>[] } = {
  users: [
    { accessorKey: "id", header: "ID", dataType: "number" },
    { accessorKey: "name", header: "Name" },
    { accessorKey: "alternative_name", header: "Alternate Name" },
    { accessorKey: "email", header: "Email" },
    { accessorKey: "code", header: "User ID" },
    { accessorKey: "communication_email", header: "Communication Email" },
    { accessorKey: "gender", header: "Gender" },
    { accessorKey: "phone_number", header: "Phone Number" },
    {
      accessorKey: "date_of_birth",
      header: "Date of Birth",
      dataType: "date",
      accessorFn: (row) =>
        row.date_of_birth ? formatDate(row.date_of_birth) : "",
    },
    { accessorKey: "house_number", header: "House number" },
    { accessorKey: "street", header: "Street" },
    { accessorKey: "township", header: "Township" },
    { accessorKey: "city", header: "City" },
    { accessorKey: "region", header: "Region" },
    { accessorKey: "country", header: "Country" },
  ],
  courses: [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "title", header: "Course Title" },
    { accessorKey: "code", header: "Code" },
    {
      accessorKey: "status",
      header: "Status",
      cell: (props) => (
        <StatusBadge status={props.row.original.status}></StatusBadge>
      ),
    },
    {
      accessorKey: "start_date",
      header: "Start Date",
      accessorFn: (row) => formatDate(row.start_date),
      dataType: "date",
    },
    {
      accessorKey: "end_date",
      header: "End Date",
      accessorFn: (row) => formatDate(row.end_date),
      dataType: "date",
    },
    {
      accessorKey: "schedule",
      header: "Schedule",
      accessorFn: (row) => {
        const a = row.first_event_time_from;
        const b = row.first_event_time_to;
        if (!a || !b) return "—";
        return `${formatSessionClock(a)} – ${formatSessionClock(b)}`;
      },
    },
    {
      accessorKey: "primary_teacher",
      header: "Primary teacher",
      cell: ({ row }) => {
        const pt = row.original.primary_teacher;
        if (!pt?.name) {
          return (
            <span className="text-muted-foreground text-sm">—</span>
          );
        }
        return <PrimaryTeacherLine teacher={pt} />;
      },
      accessorFn: (row) => {
        const pt = row.primary_teacher;
        if (!pt?.name) return "—";
        return pt.name;
      },
    },
    {
      accessorKey: "category",
      header: "Category",
      accessorFn: (row) => row.category?.name ?? "-",
      dataType: "muli-select",
      searchField: renderCategorySelectSearch,
    },
    {
      accessorKey: "program",
      header: "Program",
      accessorFn: (row) =>
        typeof row.program === "object" ? row.program?.name ?? "—" : "—",
    },
    {
      accessorKey: "intake",
      header: "Intake",
      accessorFn: (row) =>
        typeof row.intake === "object" ? row.intake?.name ?? "—" : "—",
    },
    { accessorKey: "batch_number", header: "Batch" },
    { accessorKey: "description", header: "Description" },
    {
      accessorKey: "subject",
      header: "Subject",
      accessorFn: (row) => (row.subject?.name ?? "-"),
    },
    {
      accessorKey: "exam_session_date",
      header: "Exam Intake",
      accessorFn: (row) => formatExamIntakeMonth(row.exam_session_date),
    },
    {
      accessorKey: "exam_board",
      header: "Exam Board",
    },
    { accessorKey: "meeting_join_id", header: "Meeting Join ID" },
    { accessorKey: "meeting_passcode", header: "Meeting Passcode" },
    { accessorKey: "payment_plan", header: "Payment Plan" },
  ],
  attendances: [
    {
      accessorKey: "name",
      header: ({ column }) => getSortableHeader("Name", column),
      accessorFn: (row) => row.user.name,
      meta: { label: "Name" },
    },
    {
      accessorKey: "alternative_name",
      header: ({ column }) => getSortableHeader("Alternate Name", column),
      accessorFn: (row) => row.user.alternative_name,
      meta: { label: "Alternate Name" },
    },
    {
      accessorKey: "phone_number",
      header: ({ column }) => getSortableHeader("Phone number", column),
      accessorFn: (row) => row.user.phone_number,
      meta: { label: "Phone number" },
    },
    { accessorKey: "attendance_status", header: "Status", enableHiding: false },
    {
      accessorKey: "is_removed",
      header: "Enrollment",
      cell: (r) =>
        r.row.original.is_removed ? (
          <span className="text-destructive">removed</span>
        ) : (
          <span>active student</span>
        ),
    }

  ],
  quizzes: [
    { accessorKey: "id", header: "ID" },
    {
      accessorKey: "title",
      header: "Title",
      accessorFn: (row) => row?.title,
    },
    {
      accessorKey: "status",
      header: "Status",
    },
    {
      accessorKey: "created_at",
      header: "Created At",
      accessorFn: (row) => formatDateTime(row.created_at),
      dataType: "date",
    },
    {
      accessorKey: "category",
      header: "Category",
      accessorFn: (row) => row.category?.title ?? "-",
    },
    {
      accessorKey: "created_by__name",
      header: "Created By",
      accessorFn: (row) => row.created_by?.name ?? "—",
      cell: ({ row }) => {
        const u = row.original.created_by;
        if (!u?.name) {
          return (
            <span className="text-muted-foreground text-sm">—</span>
          );
        }
        return (
          <PrimaryTeacherLine
            teacher={{
              id: u.id,
              name: u.name,
              email: u.email ?? "",
            }}
            className="text-xs"
          />
        );
      },
    },
  ],
  "quiz-questions": [
    { accessorKey: "id", header: "ID", dataType: "number" },
    {
      accessorKey: "question_type",
      header: "Type",
      accessorFn: (row: { question_type?: string }) => {
        const t = row.question_type;
        if (t === "SINGLE_CHOICE") return "Single choice";
        if (t === "MULTIPLE_CHOICE") return "Multiple choice";
        return t ?? "—";
      },
    },
    {
      accessorKey: "body_plaintext",
      header: "Question",
      accessorFn: (row: { body_plaintext?: string }) => {
        const s = row.body_plaintext?.trim();
        if (!s) return "—";
        return s.length > 200 ? `${s.slice(0, 200)}…` : s;
      },
    },
    {
      accessorKey: "quiz__title",
      header: "Quiz",
      accessorFn: (row: { quiz?: { title?: string } }) =>
        row.quiz?.title ?? "—",
    },
    {
      accessorKey: "points",
      header: "Points",
      dataType: "number",
    },
    {
      accessorKey: "created_at",
      header: "Created At",
      accessorFn: (row: { created_at?: string }) =>
        row.created_at ? formatDateTime(row.created_at) : "—",
      dataType: "date",
    },
  ],
  events: [
    { accessorKey: "id", header: "ID" },
    {
      accessorKey: "date",
      header: "Date",
      accessorFn: (row) => formatDate(row.date),
    },
    {
      header: "Time",
      accessorFn: (row) =>
        `${formatTime(row.date + " " + row.time_from)} - ${formatTime(
          row.date + " " + row.time_to
        )}`,
    },
  ],
  answers: [
    { accessorKey: "id", header: "ID", dataType: "number" },
    {
      header: "Answerer Name",
      accessorFn: (row) => row.created_by.name,
      accessorKey: "created_by__name",
    },
    {
      accessorKey: "user_score",
      header: "Score",
      accessorFn: (row) => formatUserScore(row.available_score, row.user_score),
    },
    {
      accessorKey: "is_graded",
      header: "Grading Status",
      cell: (props) => (
        <GradingStatusBadge
          status={props.row.original.is_graded}
        ></GradingStatusBadge>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Created At",
      accessorFn: (row) => formatDateTime(row.created_at),
      dataType: "date",
    },
  ],
  organizations: [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Name" },
    { accessorKey: "domain_url", header: "Domain" },
  ],
  categories: [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Name" },
    {
      accessorKey: "is_payment_assignment_eligible",
      header: "Payment Assignment Eligible",
      accessorFn: (row) => (row.is_payment_assignment_eligible ? "Yes" : "No"),
    },
  ],
  subjects: [
    { accessorKey: "name", header: "Name" },
    {
      accessorKey: "description",
      header: "Description",
      accessorFn: (row) => row.description?.trim() || "—",
    },
  ],
  programs: [
    { accessorKey: "name", header: "Name" },
    {
      accessorKey: "course_creation_method",
      header: "Creation",
      accessorFn: (row) =>
        row.course_creation_method === "intake_based" ? "Intake-based" : "Manual",
    },
    { accessorKey: "subject_strategy", header: "Subjects" },
    {
      accessorKey: "is_active",
      header: "Active",
      accessorFn: (row) => (row.is_active ? "Yes" : "No"),
    },
  ],
  intakes: [
    { accessorKey: "name", header: "Name" },
    {
      accessorKey: "program",
      header: "Program",
      accessorFn: (row) =>
        typeof row.program === "object" ? row.program?.name : row.program,
    },
    {
      accessorKey: "term",
      header: "Term",
      accessorFn: (row) => {
        const start = row.start_date ? formatDate(row.start_date) : "";
        const end = row.end_date ? formatDate(row.end_date) : "";
        if (start && end) return `${start} – ${end}`;
        return start || end || "—";
      },
    },
    {
      accessorKey: "courses_count",
      header: "Courses",
      accessorFn: (row) => row.courses_count ?? "—",
    },
  ],
  campuses: [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Name" },
    { accessorKey: "description", header: "Description" },
    { accessorKey: "location", header: "Location" },
    {
      accessorKey: "is_online",
      header: "Online",
      accessorFn: (row) => (row.is_online ? "Yes" : "No"),
    },
    {
      accessorKey: "is_default",
      header: "Default",
      accessorFn: (row) => (row.is_default ? "Yes" : "No"),
    },
  ],
  assignments: [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "title", header: "Title" },
    {
      accessorKey: "available_date",
      header: "Available Date",
      dataType: "date",
      accessorFn: (row) => formatDateTime(row.available_date),
    },
    {
      accessorKey: "due_date",
      header: "Due Date",
      dataType: "date",
      accessorFn: (row) => formatDateTime(row.due_date),
    },
    {
      accessorKey: "created_at",
      header: "Created At",
      dataType: "date",
      accessorFn: (row) => formatDateTime(row.created_at),
    },
    {
      accessorKey: "updated_at",
      header: "Updated At",
      dataType: "date",
      accessorFn: (row) => formatDateTime(row.updated_at),
    },
    {
      accessorKey: "submissions",
      header: "Total submissions",
      accessorFn: (row) => row.submissions?.length,
      isSearchDisabled: true,
    },
  ],
  submissions: [
    {
      accessorKey: "created_by__name",
      header: "Student Name",
      accessorFn: (row) => row.created_by?.name,
    },
    {
      accessorKey: "created_by__email",
      header: "Email",
      accessorFn: (row) => row.created_by?.email,
    },
    {
      accessorKey: "attempt_count",
      header: "Attempts",
    },
    {
      accessorKey: "user_score",
      header: "Score",
      accessorFn: (row) => {
        const score = row.user_score;
        const maxScore = row.assignment?.available_score;
        return score !== null && score !== undefined ? `${score}/${maxScore}` : "Not graded";
      },
    },
    {
      accessorKey: "is_submitted",
      header: "Submission Status",
      cell: (props) =>
        props.row.original.is_submitted ? (
          <Badge className="border-success/30 bg-success text-success-foreground">Submitted</Badge>
        ) : (
          <Badge className="border-warning/35 bg-warning/10 text-warning-foreground">Not Submitted</Badge>
        ),
    },
    {
      accessorKey: "is_graded",
      header: "Grading Status",
      cell: (props) => (
        <GradingStatusBadge
          status={props.row.original.is_graded}
        ></GradingStatusBadge>
      ),
    },
    {
      accessorKey: "attempt_count",
      header: "Attempts",
      accessorFn: (row) =>
        row.assignment
          ? `${row.attempt_count}/${row.assignment.max_attempts}`
          : "-",
    },
    {
      accessorKey: "user_score",
      header: "Score",
      accessorFn: (row) =>
        row.assignment
          ? formatUserScore(row.assignment.available_score, row.user_score)
          : "-",
    },
    {
      accessorKey: "created_at",
      header: "Submitted At",
      dataType: "date",
      accessorFn: (row) =>
        row.created_at ? formatDateTime(row.created_at) : "-",
    },
  ],
  "assigned-as-roles": [
    { accessorKey: "name", header: "Name" },
    {
      accessorKey: "is_collision_enabled",
      header: "Collision",
      accessorFn: (row) => (row.is_collision_enabled ? "Enabled" : "Disabled"),
    },
  ],
  departments: [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Name" },
  ],
  "user-departments": [],
  jobs: [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Name" },
    { accessorKey: "job__name", header: "Job position" },
  ],

  announcements: [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "title", header: "Title" },
    {
      accessorKey: "created_by__name",
      header: "Created By",
      accessorFn: (row) => row.created_by.name,
    },
    {
      accessorKey: "created_at",
      header: "Created At",
      dataType: "date",
      accessorFn: (row) => formatDateTime(row.created_at),
    },
    {
      accessorKey: "updated_at",
      header: "Updated At",
      dataType: "date",
      accessorFn: (row) => formatDateTime(row.updated_at),
    },
  ],
  "organizations/admins": [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Name" },
    { accessorKey: "email", header: "Email" },
  ],
  visibilities: [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Name" },

    { accessorKey: "role", header: "Role" },
    {
      accessorKey: "created_by__name",
      header: "Created By",
      accessorFn: (row) => row.created_by.name,
    },
    {
      accessorKey: "created_at",
      header: "Created At",
      dataType: "date",
      accessorFn: (row) => formatDate(row.created_at),
    },
    {
      accessorKey: "updated_at",
      header: "Updated At",
      dataType: "date",
      accessorFn: (row) => formatDate(row.updated_at),
    },
  ],
  "user-courses": [
    {
      accessorKey: "course__title",
      header: "Course Title",
      accessorFn: (row) => row.course.title,
    },
  ],
  "email-templates": [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Name" },
    {
      accessorKey: "created_by__name",
      header: "Created By",
      accessorFn: (row) => row.created_by.name,
    },
    {
      accessorKey: "created_at",
      header: "Created At",
      dataType: "date",
      accessorFn: (row) => formatDateTime(row.created_at),
    },
    {
      accessorKey: "updated_at",
      header: "Updated At",
      dataType: "date",
      accessorFn: (row) => formatDateTime(row.updated_at),
    },
  ],
  "user-emails": [
    { accessorKey: "id", header: "ID" },
    {
      accessorKey: "user__name",
      header: "User Name",
      accessorFn: (row) => row.user?.name,
    },
    {
      accessorKey: "user__email",
      header: "User Email",
      accessorFn: (row) => row.user?.email,
    },
    {
      accessorKey: "is_sent",
      header: "Sent",
      accessorFn: (row) => row.is_sent,
      cell: (props) => (
        <Badge
          className={cn({
            "border-success/30 bg-success text-success-foreground": props.row.original.is_sent,
            "bg-muted text-text-secondary": !props.row.original.is_sent,
          })}
        >
          {props.row.original.is_sent ? "Sent" : "Not Sent"}
        </Badge>
      ),
    },

    {
      accessorKey: "created_at",
      header: "Created At",
      dataType: "date",
      accessorFn: (row) => formatDateTime(row.created_at),
    },
  ],
  news: [
    { accessorKey: "id", header: "ID" },
    {
      accessorKey: "title",
      header: "Title",
      accessorFn: (row) => row.title.slice(0, 50) + "...",
    },
    {
      accessorKey: "created_by__name",
      header: "Created By",
      accessorFn: (row) => row.created_by?.name,
    },
    {
      accessorKey: "created_at",
      header: "Created At",
      dataType: "date",
      accessorFn: (row) => formatDateTime(row.created_at),
    },
  ],
  "data-verification-requests": [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Name" },
    {
      accessorKey: "created_by__name",
      header: "Created By",
      accessorFn: (row) => row.created_by?.name,
    },
    {
      accessorKey: "created_at",
      header: "Created At",
      dataType: "date",
      accessorFn: (row) => formatDateTime(row.created_at),
    },
    {
      accessorKey: "updated_at",
      header: "Updated At",
      dataType: "date",
      accessorFn: (row) => formatDateTime(row.updated_at),
    },
  ],
  "course-join-requests": [
    {
      accessorKey: "user__name",
      header: "Name",
      accessorFn: (row) => row.user?.name,
    },
    {
      accessorKey: "user__email",
      header: "Email",
      accessorFn: (row) => row.user?.email,
    },
    {
      accessorKey: "created_at",
      header: "Requested Date",
      dataType: "date",
      accessorFn: (row) => formatDate(row.created_at),
    },
    {
      accessorKey: "actions",
      header: "Actions",
      cell: (props) => (
        <JoinRequestButtons
          requestId={props.row.original.id}
          courseId={
            typeof props.row.original.course === "object" &&
            props.row.original.course != null
              ? props.row.original.course.id
              : props.row.original.course
          }
        />
      ),
    },
  ],
  "payment-methods": [
    {
      accessorKey: "name",
      header: "Name"
    },
    {
      accessorKey: "payment_bank",
      header: "Bank"
    }
  ],
  "payment-infos": [
    {
      accessorKey: "user__name",
      header: "Staff member",
      accessorFn: (row) => row.user?.name,
    },
    {
      accessorKey: "account_name",
      header: "Account name",
    },
    {
      accessorKey: "bank_type",
      header: "Bank type",
    },
    {
      accessorKey: "description",
      header: "Account/wallet number",
    },
    {
      accessorKey: "is_default",
      header: "Default",
      cell: ({ row }) =>
        row.original?.is_default ? (
          <Badge variant="secondary">Default</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "updated_at",
      header: "Updated",
      dataType: "date",
      accessorFn: (row) => formatDateTime(row.updated_at),
    },
  ],
  "payment-plans": [
    {
      accessorKey: "name",
      header: "Name",
    },
    {
      accessorKey: "price",
      header: "Price",
      cell: ({ row }) =>
        row.original && (
          <InlineInput
            value={row.original?.price != null ? String(row.original.price) : ""}
            fieldName="price"
            entityName="payment-plans"
            entityId={row.original.id}
            inputType="number"
            inputClassName="w-28"
            displayFunc={(v) => (v ? formatMoney(v, DEFAULT_TENANT_CURRENCY_SYMBOL) : "-")}
          />
        ),
    },
    {
      accessorKey: "per_hour_price",
      header: "Per Hour Price",
      cell: ({ row }) =>
        row.original && (
          <InlineInput
            value={
              row.original?.per_hour_price != null
                ? String(row.original.per_hour_price)
                : ""
            }
            fieldName="per_hour_price"
            entityName="payment-plans"
            entityId={row.original.id}
            inputType="number"
            inputClassName="w-28"
            displayFunc={(v) => (v ? formatMoney(v, DEFAULT_TENANT_CURRENCY_SYMBOL) : "-")}
          />
        ),
    },
    {
      accessorKey: "created_at",
      header: "Created Date",
      dataType: "date",
      accessorFn: (row) => formatDateTime(row.created_at),
    },
    {
      accessorKey: "updated_at",
      header: "Last Updated",
      dataType: "date",
      accessorFn: (row) => formatDateTime(row.updated_at),
    },
  ],
  discounts: [
    {
      accessorKey: "name",
      header: "Name",
    },
    {
      accessorKey: "discount_type",
      header: "Type",
    },
    {
      accessorKey: "percent_value",
      header: "Percent",
      accessorFn: (row) =>
        row.discount_type === "percent" && row.percent_value != null
          ? `${row.percent_value}%`
          : "-",
    },
    {
      accessorKey: "fixed_amount",
      header: "Fixed amount",
      cell: ({ row }) =>
        row.original?.fixed_amount != null
          ? formatMoney(String(row.original.fixed_amount), DEFAULT_TENANT_CURRENCY_SYMBOL)
          : "-",
    },
    {
      accessorKey: "scope",
      header: "Scope",
    },
    {
      accessorKey: "is_active",
      header: "Active",
      accessorFn: (row) => (row.is_active ? "Yes" : "No"),
    },
  ],
};

const defaultColumns: ColumnStrategyType = {
  artifact: ArtifactType.COLUMNS,
  name: "default",
  getColumns: (entityName: string) => {
    return baseColumns[entityName];
  },
};

export default defaultColumns;
