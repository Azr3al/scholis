import { describe, expect, it } from "vitest";

import {
  autoAllocate,
  checkAllocationBalance,
} from "@/lib/finances/payment-allocation";

const screenshot = (key: string, amount: number | null) => ({ key, amount });
const course = (
  userId: number,
  courseId: number,
  invoicedAmount: number | null,
) => ({
  userId,
  courseId,
  title: `Course ${courseId}`,
  invoicedAmount,
});

describe("autoAllocate", () => {
  it("splits one screenshot across courses by their invoiced amounts", () => {
    const entries = autoAllocate([screenshot("s1", 200)], [
      course(1, 1, 150),
      course(1, 2, 50),
    ]);
    expect(entries).toEqual([
      { screenshotKey: "s1", userId: 1, courseId: 1, amount: 150 },
      { screenshotKey: "s1", userId: 1, courseId: 2, amount: 50 },
    ]);
  });

  it("spreads one screenshot across two students", () => {
    const entries = autoAllocate([screenshot("s1", 200)], [
      course(1, 10, 150),
      course(2, 20, 50),
    ]);
    expect(entries).toEqual([
      { screenshotKey: "s1", userId: 1, courseId: 10, amount: 150 },
      { screenshotKey: "s1", userId: 2, courseId: 20, amount: 50 },
    ]);
  });

  it("pushes an unexplained remainder onto the last course so the total balances", () => {
    const entries = autoAllocate([screenshot("s1", 220)], [
      course(1, 1, 150),
      course(1, 2, 50),
    ]);
    const balance = checkAllocationBalance([screenshot("s1", 220)], entries);
    expect(balance.isBalanced).toBe(true);
    expect(entries.at(-1)).toEqual({
      screenshotKey: "s1",
      userId: 1,
      courseId: 2,
      amount: 70,
    });
  });

  it("spans two screenshots when one course costs more than the first covers", () => {
    const entries = autoAllocate(
      [screenshot("s1", 100), screenshot("s2", 100)],
      [course(1, 1, 150), course(1, 2, 50)],
    );
    expect(entries).toEqual([
      { screenshotKey: "s1", userId: 1, courseId: 1, amount: 100 },
      { screenshotKey: "s2", userId: 1, courseId: 1, amount: 50 },
      { screenshotKey: "s2", userId: 1, courseId: 2, amount: 50 },
    ]);
  });

  it("never allocates more than the screenshots hold, even if the courses cost more", () => {
    const screenshots = [screenshot("s1", 120)];
    const entries = autoAllocate(screenshots, [course(1, 1, 150), course(1, 2, 50)]);
    expect(entries).toEqual([
      { screenshotKey: "s1", userId: 1, courseId: 1, amount: 120 },
    ]);
    const balance = checkAllocationBalance(screenshots, entries);
    expect(balance.allocatedTotal).toBe(120);
    expect(balance.isBalanced).toBe(true);
  });

  it("treats an unknown invoiced amount as zero rather than dropping the course", () => {
    const entries = autoAllocate([screenshot("s1", 90)], [
      course(1, 1, null),
      course(1, 2, null),
    ]);
    expect(entries).toEqual([
      { screenshotKey: "s1", userId: 1, courseId: 2, amount: 90 },
    ]);
  });
});

describe("checkAllocationBalance", () => {
  it("flags a screenshot that is over-allocated even when the grand total matches", () => {
    const screenshots = [screenshot("s1", 100), screenshot("s2", 100)];
    const balance = checkAllocationBalance(screenshots, [
      { screenshotKey: "s1", userId: 1, courseId: 1, amount: 140 },
      { screenshotKey: "s2", userId: 1, courseId: 2, amount: 60 },
    ]);
    expect(balance.allocatedTotal).toBe(200);
    expect(balance.isBalanced).toBe(false);
    expect(balance.perScreenshot.map((s) => s.isBalanced)).toEqual([false, false]);
  });

  it("treats a sub-cent difference as balanced", () => {
    const screenshots = [screenshot("s1", 100)];
    const balance = checkAllocationBalance(screenshots, [
      { screenshotKey: "s1", userId: 1, courseId: 1, amount: 99.999 },
    ]);
    expect(balance.isBalanced).toBe(true);
  });

  it("is unbalanced while a screenshot amount is still unread", () => {
    const balance = checkAllocationBalance([screenshot("s1", null)], []);
    expect(balance.isBalanced).toBe(false);
  });
});
