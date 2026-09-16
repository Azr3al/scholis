import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

class NoSkipsReporter implements Reporter {
  private skipped: string[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === "skipped") {
      this.skipped.push(test.titlePath().join(" > "));
    }
  }

  onEnd(result: FullResult): { status?: FullResult["status"] } {
    if (this.skipped.length === 0) {
      return { status: result.status };
    }

    console.error(
      `[browser gate] Skipped tests are forbidden:\n${this.skipped
        .map((title) => `- ${title}`)
        .join("\n")}`,
    );
    return { status: "failed" };
  }
}

export default NoSkipsReporter;
