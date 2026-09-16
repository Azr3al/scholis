export const TEAMS_MAX_INLINE_IMAGES = 10;
export const TEAMS_MAX_INLINE_BYTES = 3 * 1024 * 1024;
export const TEAMS_MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export type InlineImageNode = {
  attachmentId: number | null;
  byteSize: number | null;
};

export type TeamsBudget = {
  imageCount: number;
  totalBytes: number;
  withinBudget: boolean;
  errors: string[];
};

export function computeTeamsBudget(nodes: InlineImageNode[]): TeamsBudget {
  const ready = nodes.filter(
    (n) => n.attachmentId != null && n.byteSize != null && !Number.isNaN(n.byteSize),
  );
  const imageCount = ready.length;
  const totalBytes = ready.reduce((sum, n) => sum + (n.byteSize ?? 0), 0);
  const errors: string[] = [];

  if (imageCount > TEAMS_MAX_INLINE_IMAGES) {
    errors.push(
      `Teams allows up to ${TEAMS_MAX_INLINE_IMAGES} inline images per message.`,
    );
  }
  if (totalBytes > TEAMS_MAX_INLINE_BYTES) {
    const mb = (totalBytes / (1024 * 1024)).toFixed(1);
    const limitMb = (TEAMS_MAX_INLINE_BYTES / (1024 * 1024)).toFixed(1);
    errors.push(`Images total ${mb} MB; Teams limit is ${limitMb} MB.`);
  }
  for (const node of ready) {
    if ((node.byteSize ?? 0) > TEAMS_MAX_IMAGE_BYTES) {
      errors.push(
        `One image exceeds the ${TEAMS_MAX_IMAGE_BYTES / (1024 * 1024)} MB per-image limit.`,
      );
      break;
    }
  }

  return {
    imageCount,
    totalBytes,
    withinBudget: errors.length === 0,
    errors,
  };
}

export function formatTeamsBudgetSummary(budget: TeamsBudget): string {
  const mb = (budget.totalBytes / (1024 * 1024)).toFixed(1);
  const limitMb = (TEAMS_MAX_INLINE_BYTES / (1024 * 1024)).toFixed(1);
  return `Teams: ${budget.imageCount}/${TEAMS_MAX_INLINE_IMAGES} images · ${mb}/${limitMb} MB`;
}
