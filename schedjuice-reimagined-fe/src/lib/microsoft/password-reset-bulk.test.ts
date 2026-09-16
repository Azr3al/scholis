import { describe, expect, it, vi } from "vitest";

import {
  chunkEmails,
  MAX_MS_PASSWORD_RESET_EMAILS,
  runBatchesSequentially,
} from "./password-reset-bulk";

describe("password-reset-bulk", () => {
  describe("chunkEmails", () => {
    it("returns empty array for empty input", () => {
      expect(chunkEmails([])).toEqual([]);
    });

    it("returns one chunk when under cap", () => {
      const emails = ["a@x.io", "b@x.io"];
      expect(chunkEmails(emails)).toEqual([emails]);
    });

    it("splits exact multiples of 50", () => {
      const emails = Array.from({ length: 100 }, (_, i) => `u${i}@x.io`);
      const chunks = chunkEmails(emails);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toHaveLength(50);
      expect(chunks[1]).toHaveLength(50);
    });

    it("splits remainder into final chunk", () => {
      const emails = Array.from({ length: 51 }, (_, i) => `u${i}@x.io`);
      const chunks = chunkEmails(emails);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toHaveLength(MAX_MS_PASSWORD_RESET_EMAILS);
      expect(chunks[1]).toHaveLength(1);
    });
  });

  describe("runBatchesSequentially", () => {
    it("completes all batches in order", async () => {
      const batches = [["a"], ["b"], ["c"]];
      const runBatch = vi.fn(async (batch: string[]) => batch[0]!);
      const settled: string[] = [];

      const outcome = await runBatchesSequentially(
        batches,
        0,
        runBatch,
        (result) => {
          settled.push(result);
        },
      );

      expect(outcome).toEqual({ completedThrough: 2 });
      expect(runBatch).toHaveBeenCalledTimes(3);
      expect(settled).toEqual(["a", "b", "c"]);
    });

    it("stops on mid-list failure and reports completedThrough", async () => {
      const batches = [["a"], ["b"], ["c"]];
      const runBatch = vi.fn(async (batch: string[]) => {
        if (batch[0] === "b") {
          throw new Error("batch failed");
        }
        return batch[0]!;
      });
      const settled: string[] = [];

      const outcome = await runBatchesSequentially(
        batches,
        0,
        runBatch,
        (result) => {
          settled.push(result);
        },
      );

      expect(outcome.completedThrough).toBe(0);
      expect(outcome.error).toBeInstanceOf(Error);
      expect(runBatch).toHaveBeenCalledTimes(2);
      expect(settled).toEqual(["a"]);
    });

    it("resuming from failed batch does not re-invoke earlier batches", async () => {
      const batches = [["a"], ["b"], ["c"]];
      let failOnce = true;
      const runBatch = vi.fn(async (batch: string[]) => {
        if (batch[0] === "b" && failOnce) {
          failOnce = false;
          throw new Error("batch failed");
        }
        return batch[0]!;
      });
      const settled: string[] = [];

      const first = await runBatchesSequentially(
        batches,
        0,
        runBatch,
        (result) => {
          settled.push(result);
        },
      );
      expect(first.completedThrough).toBe(0);

      const second = await runBatchesSequentially(
        batches,
        first.completedThrough + 1,
        runBatch,
        (result) => {
          settled.push(result);
        },
      );

      expect(second).toEqual({ completedThrough: 2 });
      expect(runBatch).toHaveBeenCalledTimes(4);
      expect(settled).toEqual(["a", "b", "c"]);
    });
  });
});
