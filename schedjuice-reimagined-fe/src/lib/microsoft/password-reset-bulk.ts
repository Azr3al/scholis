export const MAX_MS_PASSWORD_RESET_EMAILS = 50;

export const MS_PASSWORD_RESET_BATCH_DELAY_MS = 400;

export function chunkEmails(
  emails: string[],
  size = MAX_MS_PASSWORD_RESET_EMAILS,
): string[][] {
  if (emails.length === 0) {
    return [];
  }
  const chunks: string[][] = [];
  for (let i = 0; i < emails.length; i += size) {
    chunks.push(emails.slice(i, i + size));
  }
  return chunks;
}

export type BatchRunOutcome = {
  completedThrough: number;
  error?: unknown;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function runBatchesSequentially<T, R>(
  batches: T[][],
  startIndex: number,
  runBatch: (batch: T[], batchIndex: number) => Promise<R>,
  onBatchSettled: (result: R, batchIndex: number) => void,
  delayMs = 0,
): Promise<BatchRunOutcome> {
  if (batches.length === 0) {
    return { completedThrough: -1 };
  }

  const safeStart = Math.max(0, Math.min(startIndex, batches.length - 1));
  let completedThrough = safeStart - 1;

  for (let batchIndex = safeStart; batchIndex < batches.length; batchIndex += 1) {
    try {
      const result = await runBatch(batches[batchIndex]!, batchIndex);
      onBatchSettled(result, batchIndex);
      completedThrough = batchIndex;
    } catch (error) {
      return { completedThrough, error };
    }

    if (delayMs > 0 && batchIndex < batches.length - 1) {
      await sleep(delayMs);
    }
  }

  return { completedThrough };
}
