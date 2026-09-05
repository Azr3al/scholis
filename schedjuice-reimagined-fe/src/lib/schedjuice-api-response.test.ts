import { describe, expect, it } from "vitest";
import type { AxiosResponse } from "axios";
import { assertSchedjuiceSuccess } from "./schedjuice-api-response";

function mockAxiosResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: { headers: {} } as AxiosResponse<T>["config"],
  };
}

describe("assertSchedjuiceSuccess", () => {
  it("returns data when isError is false", () => {
    const res = mockAxiosResponse({
      isError: false,
      message: "success",
      data: { ok: true },
    });
    expect(assertSchedjuiceSuccess(res)).toEqual({ ok: true });
  });

  it("throws when isError is true even on 200", () => {
    const res = mockAxiosResponse({
      isError: true,
      message: "bad_request",
      details: { message: "No more events to check in for today" },
    });
    expect(() => assertSchedjuiceSuccess(res)).toThrow(/No more events/);
  });
});
