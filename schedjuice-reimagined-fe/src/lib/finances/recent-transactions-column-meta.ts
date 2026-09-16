import type { ColumnLayoutMeta } from "@/lib/finances/apply-column-layout-meta";

const RECENT_TXN_TXN_ID_MIN_WIDTH = "18rem";
const RECENT_TXN_DESCRIPTION_MIN_WIDTH = "20rem";
const RECENT_TXN_STUDENT_MIN_WIDTH = "12rem";

type RecentTxnLayoutOpts = {
  canVerify: boolean;
  userUploadStrategy: boolean;
};

export function recentTransactionsColumnLayout(
  opts: RecentTxnLayoutOpts,
): ColumnLayoutMeta[] {
  const cols: ColumnLayoutMeta[] = [
    {
      id: "user__name",
      contentRole: "person",
      minWidth: RECENT_TXN_STUDENT_MIN_WIDTH,
      preferredWidth: "14rem",
      align: "left",
      truncate: true,
    },
    {
      id: "course",
      contentRole: "prose",
      minWidth: "10rem",
      preferredWidth: "12rem",
      align: "left",
      truncate: true,
    },
    {
      id: "transaction_id",
      contentRole: "identifier",
      minWidth: RECENT_TXN_TXN_ID_MIN_WIDTH,
      preferredWidth: "20rem",
      align: "left",
      truncate: false,
    },
    {
      id: "status",
      contentRole: "status",
      minWidth: "10rem",
      preferredWidth: "11rem",
      align: "left",
      truncate: false,
    },
    {
      id: "payment_date",
      contentRole: "date",
      minWidth: "9rem",
      align: "left",
      truncate: false,
    },
    {
      id: "description",
      contentRole: "prose",
      minWidth: RECENT_TXN_DESCRIPTION_MIN_WIDTH,
      preferredWidth: "22rem",
      align: "left",
      truncate: false,
    },
    {
      id: "remarks",
      contentRole: "prose",
      minWidth: "14rem",
      preferredWidth: "16rem",
      align: "left",
      truncate: false,
    },
    {
      id: "created_by",
      contentRole: "person",
      minWidth: "9rem",
      align: "left",
      truncate: true,
    },
  ];

  if (opts.userUploadStrategy) {
    cols.splice(5, 0, {
      id: "billing_start_date",
      contentRole: "date",
      minWidth: "11rem",
      align: "left",
      truncate: false,
    });
  } else {
    cols.splice(5, 0, {
      id: "payment_method__name",
      contentRole: "prose",
      minWidth: "10rem",
      align: "left",
      truncate: true,
    });
    cols.splice(6, 0, {
      id: "payment_method__payment_bank",
      contentRole: "prose",
      minWidth: "5rem",
      preferredWidth: "6rem",
      align: "left",
      truncate: true,
    });
    cols.splice(7, 0, {
      id: "date_on_screenshot",
      contentRole: "date",
      minWidth: "9rem",
      align: "left",
      truncate: false,
    });
  }

  if (opts.canVerify) {
    const statusIdx = cols.findIndex((c) => c.id === "status");
    cols.splice(statusIdx, 0, {
      id: "parsed_amount",
      contentRole: "money",
      minWidth: "7.5rem",
      preferredWidth: "8.5rem",
      align: "right",
      truncate: false,
    });
  }

  cols.push({
    id: "_actions",
    contentRole: "action",
    minWidth: "6.5rem",
    align: "center",
    truncate: false,
  });

  return cols;
}
