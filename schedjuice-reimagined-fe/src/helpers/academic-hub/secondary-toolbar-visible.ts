import { HUB_PROGRAM_ALL } from "@/types/academic-hub";

export function shouldShowSecondaryToolbar(args: {
  program: string;
  isOnlyTeacher: boolean;
  isStudent: boolean;
}): boolean {
  return (
    args.program !== HUB_PROGRAM_ALL &&
    !args.isOnlyTeacher &&
    !args.isStudent
  );
}
