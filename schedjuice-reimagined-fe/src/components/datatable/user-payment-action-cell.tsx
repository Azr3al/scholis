import { Button, buttonVariants, useToast } from "@/components/primitives";
import { useMutation } from "@tanstack/react-query";
import { deleteEntity } from "@/app/client-api/utils";
import { UserPaymentStatus } from "@/types/finance";
import { Trash } from "iconoir-react";
import ConfirmationDialog from "../misc/confirmation-dialog";
import { invalidateUserPaymentsCaches } from "@/lib/finances/invalidate-user-payments-caches";
import { queryClient } from "@/lib/query";
import { useUser } from "@/hooks/useUser";
import { usePermissions } from "@/hooks/usePermissions";

interface UserPaymentActionCellProps {
  userPaymentId: string;
  onView: () => void;
  onDuplicateSearch: () => void;
  status: UserPaymentStatus;
  showView?: boolean;
  showCoverage?: boolean;
  onEditCoverage?: () => void;
  canDownloadReceipt?: boolean;
  onDownloadReceipt?: () => void | Promise<void>;
  isDownloadingReceipt?: boolean;
}

const UserPaymentActionCell: React.FC<UserPaymentActionCellProps> = ({
  userPaymentId,
  onView,
  onDuplicateSearch,
  status,
  showView = true,
  showCoverage,
  onEditCoverage,
  canDownloadReceipt,
  onDownloadReceipt,
  isDownloadingReceipt,
}) => {
  const { user } = useUser()
  const { can } = usePermissions();
  const toast = useToast();
  const deleteMutation = useMutation({
    mutationKey: ["deleteUserPayment", userPaymentId],
    mutationFn: () => deleteEntity("user-payments", userPaymentId),
    onSuccess: () => {
      toast.add({
        title: "Success",
        description: "Transaction successfully deleted.",
      });
      void invalidateUserPaymentsCaches(queryClient);
    },
  });
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {showView ? (
        <Button
          className="shrink-0"
          isLoading={deleteMutation.isPending}
          onClick={onView}
          type="button"
          variant="secondary"
          size={"sm"}
        >
          View
        </Button>
      ) : null}
      {showCoverage && onEditCoverage ? (
        <Button
          className="shrink-0"
          type="button"
          variant="secondary"
          size="sm"
          onClick={onEditCoverage}
        >
          Coverage
        </Button>
      ) : null}
      {canDownloadReceipt && onDownloadReceipt ? (
        <Button
          className="shrink-0"
          type="button"
          variant="secondary" size="sm"
          isLoading={isDownloadingReceipt}
          disabled={isDownloadingReceipt}
          onClick={() => void onDownloadReceipt()}
        >
          Receipt
        </Button>
      ) : null}
      <ConfirmationDialog
        isLoading={deleteMutation.isPending}
        content="This action cannot be undone"
        onConfirm={() => deleteMutation.mutate()}
      >
        <Button
          aria-label="Delete payment"
          className="shrink-0"
          disabled={Boolean(user && !can("payment.verify"))}
          isLoading={deleteMutation.isPending}
          type="button"
          size="sm"
          variant="danger"
        >
          <Trash></Trash>
        </Button>
      </ConfirmationDialog>
      {status === UserPaymentStatus.duplicated && (
        <Button
          className="shrink-0"
          isLoading={deleteMutation.isPending}
          onClick={onDuplicateSearch}
          type="button"
          variant="secondary"
          size={"sm"}
        >
          See duplicates
        </Button>
      )}
    </div>
  );
};

export default UserPaymentActionCell;
