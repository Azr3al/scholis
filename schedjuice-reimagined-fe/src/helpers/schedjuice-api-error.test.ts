import axios from "axios";
import { describe, expect, it } from "vitest";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";

describe("parseSchedjuiceApiError payroll_rate_missing", () => {
  it("passes through backend details.message", () => {
    const err = {
      response: {
        data: {
          isError: true,
          message: "payroll_rate_missing",
          details: {
            message:
              "Hourly rate missing. Please inform your school admin to configure your hourly rate",
          },
        },
      },
    };
    expect(parseSchedjuiceApiError(err)).toContain("inform your school admin");
  });

  it("returns payroll_rate_missing code when details are absent", () => {
    const err = axios.isAxiosError
      ? ({
          isAxiosError: true,
          response: {
            status: 400,
            data: {
              isError: true,
              message: "payroll_rate_missing",
            },
          },
        } as unknown)
      : null;
    Object.defineProperty(err, "isAxiosError", { value: true });
    expect(parseSchedjuiceApiError(err)).toBe("payroll_rate_missing");
  });
});
