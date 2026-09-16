/** OCR amounts arrive as strings, so compare money with a half-cent tolerance. */
export const ALLOCATION_TOLERANCE = 0.005;

export type AllocationScreenshot = {
  /** Stable client-side key for one uploaded screenshot. */
  key: string;
  amount: number | null;
};

export type AllocationCourse = {
  userId: number;
  courseId: number;
  title: string;
  /** Invoiced amount after this course's discounts, or null while unpriced. */
  invoicedAmount: number | null;
};

export type AllocationEntry = {
  screenshotKey: string;
  userId: number;
  courseId: number;
  amount: number;
};

export type AllocationBalance = {
  screenshotTotal: number;
  allocatedTotal: number;
  isBalanced: boolean;
  perScreenshot: Array<{
    key: string;
    expected: number | null;
    allocated: number;
    isBalanced: boolean;
  }>;
};

export function allocationEntryKey(entry: {
  screenshotKey: string;
  userId: number;
  courseId: number;
}): string {
  return `${entry.screenshotKey}::${entry.userId}::${entry.courseId}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Fill each course's invoiced amount from the screenshots in order. The last
 * course absorbs whatever is left so a balanced submission is the default.
 */
export function autoAllocate(
  screenshots: AllocationScreenshot[],
  courses: AllocationCourse[],
): AllocationEntry[] {
  const entries: AllocationEntry[] = [];
  const pool = screenshots.map((s) => ({ key: s.key, left: s.amount ?? 0 }));
  let poolIndex = 0;

  courses.forEach((course, courseIndex) => {
    const remainingInPool = pool
      .slice(poolIndex)
      .reduce((sum, slot) => sum + slot.left, 0);
    const isLast = courseIndex === courses.length - 1;
    let need = isLast
      ? remainingInPool
      : Math.min(course.invoicedAmount ?? 0, remainingInPool);

    while (need > ALLOCATION_TOLERANCE && poolIndex < pool.length) {
      const slot = pool[poolIndex]!;
      if (slot.left <= ALLOCATION_TOLERANCE) {
        poolIndex += 1;
        continue;
      }
      const take = roundMoney(Math.min(slot.left, need));
      entries.push({
        screenshotKey: slot.key,
        userId: course.userId,
        courseId: course.courseId,
        amount: take,
      });
      slot.left = roundMoney(slot.left - take);
      need = roundMoney(need - take);
      if (slot.left <= ALLOCATION_TOLERANCE) poolIndex += 1;
    }
  });

  return entries;
}

export function checkAllocationBalance(
  screenshots: AllocationScreenshot[],
  entries: AllocationEntry[],
): AllocationBalance {
  const allocatedByKey = new Map<string, number>();
  for (const entry of entries) {
    allocatedByKey.set(
      entry.screenshotKey,
      roundMoney((allocatedByKey.get(entry.screenshotKey) ?? 0) + entry.amount),
    );
  }

  const perScreenshot = screenshots.map((screenshot) => {
    const allocated = allocatedByKey.get(screenshot.key) ?? 0;
    const expected = screenshot.amount;
    return {
      key: screenshot.key,
      expected,
      allocated,
      isBalanced:
        expected != null &&
        Math.abs(expected - allocated) < ALLOCATION_TOLERANCE,
    };
  });

  const screenshotTotal = roundMoney(
    screenshots.reduce((sum, s) => sum + (s.amount ?? 0), 0),
  );
  const allocatedTotal = roundMoney(
    entries.reduce((sum, entry) => sum + entry.amount, 0),
  );

  return {
    screenshotTotal,
    allocatedTotal,
    isBalanced:
      screenshots.length > 0 && perScreenshot.every((s) => s.isBalanced),
    perScreenshot,
  };
}
