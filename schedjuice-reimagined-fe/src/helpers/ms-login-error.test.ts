import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { AxiosError } from "axios";
import {
  clearStuckMsalInteractionStatus,
  formatMicrosoftLoginError,
  isMsalInteractionInProgressError,
  validateMicrosoftMsalConfig,
} from "./ms-login-error";

describe("isMsalInteractionInProgressError", () => {
  it("detects MSAL interaction_in_progress by errorCode", () => {
    expect(
      isMsalInteractionInProgressError({
        errorCode: "interaction_in_progress",
        errorMessage: "Interaction is currently in progress.",
      }),
    ).toBe(true);
  });

  it("returns false for other MSAL errors", () => {
    expect(
      isMsalInteractionInProgressError({ errorCode: "user_cancelled" }),
    ).toBe(false);
  });
});

describe("clearStuckMsalInteractionStatus", () => {
  const original = globalThis.sessionStorage;

  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        get length() {
          return store.size;
        },
        clear: () => store.clear(),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: original,
    });
  });

  it("removes msal interaction.status keys only", () => {
    sessionStorage.setItem("msal.interaction.status", "interaction_in_progress");
    sessionStorage.setItem(
      "msal.abc.interaction.status",
      "interaction_in_progress",
    );
    sessionStorage.setItem("msal.abc.idtoken", "keep-me");
    clearStuckMsalInteractionStatus();
    expect(sessionStorage.getItem("msal.interaction.status")).toBeNull();
    expect(sessionStorage.getItem("msal.abc.interaction.status")).toBeNull();
    expect(sessionStorage.getItem("msal.abc.idtoken")).toBe("keep-me");
  });
});

describe("validateMicrosoftMsalConfig", () => {
  it("rejects empty authority", () => {
    expect(validateMicrosoftMsalConfig("app-id", "")).toMatch(/authority/i);
  });

  it("rejects non-URL authority and includes the raw value", () => {
    const message = validateMicrosoftMsalConfig(
      "app-id",
      "contoso.onmicrosoft.com",
    );
    expect(message).not.toBeNull();
    expect(message).toContain("contoso.onmicrosoft.com");
    expect(message!.toLowerCase()).toMatch(/invalid.*authority|authority.*invalid/);
  });

  it("rejects missing app id", () => {
    expect(
      validateMicrosoftMsalConfig(
        "",
        "https://login.microsoftonline.com/contoso.onmicrosoft.com",
      ),
    ).toMatch(/app id|app_id/i);
  });

  it("accepts a normal Entra authority", () => {
    expect(
      validateMicrosoftMsalConfig(
        "11111111-1111-1111-1111-111111111111",
        "https://login.microsoftonline.com/contoso.onmicrosoft.com",
      ),
    ).toBeNull();
  });
});

describe("formatMicrosoftLoginError", () => {
  it("includes MSAL errorCode and errorMessage", () => {
    const message = formatMicrosoftLoginError({
      errorCode: "user_cancelled",
      errorMessage: "User cancelled the flow",
    });
    expect(message).toContain("user_cancelled");
    expect(message).toContain("User cancelled the flow");
  });

  it("formats axios ms-login validation details with status", () => {
    const err = new AxiosError("Request failed");
    err.response = {
      status: 400,
      statusText: "Bad Request",
      headers: {},
      config: { headers: {} } as never,
      data: {
        isError: true,
        details: "No such user exists in this tenant.",
      },
    };
    const message = formatMicrosoftLoginError(err);
    expect(message).toContain("400");
    expect(message).toContain("No such user exists in this tenant.");
  });

  it("formats axios network failures without a response", () => {
    const err = new AxiosError("Network Error");
    err.code = "ERR_NETWORK";
    const message = formatMicrosoftLoginError(err);
    expect(message.toLowerCase()).toMatch(/reach|network|server/);
  });

  it("truncates overlong Graph-style detail bodies", () => {
    const long = "x".repeat(500);
    const message = formatMicrosoftLoginError({
      errorCode: "server_error",
      errorMessage: long,
    });
    expect(message.length).toBeLessThanOrEqual(220);
    expect(message.endsWith("…")).toBe(true);
  });

  it("falls back to Error.message", () => {
    expect(formatMicrosoftLoginError(new Error("popup blocked"))).toContain(
      "popup blocked",
    );
  });

  it("falls back for unknown values", () => {
    expect(formatMicrosoftLoginError(null)).toMatch(/Microsoft sign-in failed/i);
  });
});
