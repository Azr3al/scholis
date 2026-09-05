import { Button } from "@/components/primitives";
import Link from "next/link";

type CourseTabEditBarProps = {
  editHref?: string;
  showEdit?: boolean;
};

export function CourseTabEditBar({ editHref, showEdit }: CourseTabEditBarProps) {
  if (!showEdit || !editHref) {
    return null;
  }

  return (
    <div className="flex justify-end">
      <Link href={editHref}>
        <Button size="sm" variant="primary">
          Edit
        </Button>
      </Link>
    </div>
  );
}
