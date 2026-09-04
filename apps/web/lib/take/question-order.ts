import { applyQuestionOrder } from '@scholis/engine';
import type { TestPackage } from '@scholis/schema';

/** Apply a stored attempt question order to a canonical package. */
export const packageForAttempt = (
  pkg: TestPackage,
  questionOrder: string[] | null,
): TestPackage => {
  if (questionOrder === null || questionOrder.length === 0) return pkg;
  return applyQuestionOrder(pkg, questionOrder);
};
