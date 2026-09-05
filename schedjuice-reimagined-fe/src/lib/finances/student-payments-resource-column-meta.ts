import type { ColumnLayoutMeta } from "@/lib/finances/apply-column-layout-meta";

const STUDENT_PAYMENT_TXN_COL_MIN = "18rem";
const STUDENT_PAYMENT_DESC_COL_MIN = "20rem";
const STUDENT_PAYMENT_STUDENT_COL_MIN = "12rem";
const STUDENT_PAYMENT_STATUS_COL_MIN = "11rem";

type StudentPaymentsResourceLayoutOpts = {
  hideCourseColumn: boolean;
  userUploadStrategy: boolean;
  canVerify: boolean;
  showRemainingAmount?: boolean;
};

export function studentPaymentsResourceColumnLayout(
  opts: StudentPaymentsResourceLayoutOpts,
): ColumnLayoutMeta[] {
  const cols: ColumnLayoutMeta[] = [
    {
      id: "_serial",
      contentRole: "identifier",
      minWidth: "3rem",
      preferredWidth: "3rem",
      align: "center",
      sticky: "left",
    },
    {
      id: "user__name",
      contentRole: "person",
      minWidth: STUDENT_PAYMENT_STUDENT_COL_MIN,
      preferredWidth: "14rem",
      align: "left",
      truncate: false,
      sticky: "left",
    },
    {
      id: "user__email",
      contentRole: "prose",
      minWidth: "12rem",
      preferredWidth: "16rem",
      align: "left",
      truncate: true,
    },
  ];
  if (!opts.hideCourseColumn) {
    cols.push({
      id: "course",
      contentRole: "prose",
      minWidth: "10rem",
      align: "left",
      truncate: true,
    });
  }
  if (opts.userUploadStrategy) {
    cols.push({
      id: "billing_start_date",
      contentRole: "prose",
      minWidth: "10rem",
      align: "left",
      truncate: false,
    });
  }
  if (opts.canVerify) {
    cols.push({
      id: "parsed_amount",
      contentRole: "money",
      minWidth: "7.5rem",
      preferredWidth: "9rem",
      align: "left",
      truncate: false,
    });
  }
  if (opts.showRemainingAmount) {
    cols.push({
      id: "remaining_amount",
      contentRole: "money",
      minWidth: "9rem",
      preferredWidth: "10rem",
      align: "left",
      truncate: false,
    });
  }
  if (!opts.userUploadStrategy) {
    cols.push(
      {
        id: "payment_method__name",
        contentRole: "prose",
        minWidth: "10rem",
        align: "left",
        truncate: false,
      },
      {
        id: "date_on_screenshot",
        contentRole: "prose",
        minWidth: "9rem",
        align: "left",
        truncate: false,
      },
    );
  }
  cols.push(
    {
      id: "status",
      contentRole: "status",
      minWidth: STUDENT_PAYMENT_STATUS_COL_MIN,
      align: "left",
      truncate: false,
    },
    {
      id: "transaction_id",
      contentRole: "identifier",
      minWidth: STUDENT_PAYMENT_TXN_COL_MIN,
      preferredWidth: "20rem",
      align: "left",
      truncate: false,
    },
    {
      id: "description",
      contentRole: "prose",
      minWidth: STUDENT_PAYMENT_DESC_COL_MIN,
      preferredWidth: "22rem",
      align: "left",
      truncate: false,
    },
    {
      id: "remarks",
      contentRole: "prose",
      minWidth: STUDENT_PAYMENT_DESC_COL_MIN,
      preferredWidth: "22rem",
      align: "left",
      truncate: false,
    },
    {
      id: "payment_date",
      contentRole: "date",
      minWidth: "9rem",
      preferredWidth: "10rem",
      align: "left",
      truncate: true,
    },
    {
      id: "created_by",
      contentRole: "person",
      minWidth: "9rem",
      preferredWidth: "10rem",
      align: "left",
      truncate: true,
    },
    {
      id: "_actions",
      contentRole: "action",
      minWidth: "8rem",
      align: "right",
    },
  );
  return cols;
}
