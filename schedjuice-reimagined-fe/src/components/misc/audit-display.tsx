import { Skeleton } from "@/components/primitives";
import { formatDateTime } from "@/helpers/date";

interface AuditDisplayProps {
  created_by?: {
    name: string;
  };
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
  isLoading?: boolean;
}

function auditDateToInput(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString();
}

const AuditDisplay: React.FC<AuditDisplayProps> = ({
  created_by,
  created_at,
  updated_at,
  isLoading = false,
}) => {
  return (
    <div className="text-sm">
      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="w-10 h-5"></Skeleton>
          <Skeleton className="w-10 h-5"></Skeleton>
        </div>
      )}
      {!isLoading && created_by && (
        <p>
          <span className="font-bold">Created By:{" "}</span>
          {created_by.name}
        </p>
      )}
      {!isLoading && created_at != null && (
        <p>
          <span className="font-bold">Created At:{" "}</span>
          {formatDateTime(auditDateToInput(created_at))}
        </p>
      )}
      {!isLoading && updated_at != null && (
        <p>
          <span className="font-bold">Updated At:{" "}</span>
          {formatDateTime(auditDateToInput(updated_at))}
        </p>
      )}
    </div>
  );
};

export default AuditDisplay;
