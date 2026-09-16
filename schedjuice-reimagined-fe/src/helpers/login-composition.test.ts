import { afterEach, describe, expect, it } from "vitest";

import {
  buildGoogleLoginStartUrl,
  getEnabledSocialProviders,
  normalizeTelegramBotUsername,
  parseGoogleOAuthReturn,
  parseTelegramOAuthHash,
  parseTelegramOAuthReturn,
  shouldShowGoogleLogin,
  shouldShowMicrosoftLogin,
  shouldShowTelegramLogin,
} from "./login-composition";

describe("shouldShowTelegramLogin", () => {
  it("returns false when login flag is off", () => {
    expect(
      shouldShowTelegramLogin({
        is_telegram_login_on: false,
        telegram_bot_id: "12345",
      } as never),
    ).toBe(false);
  });

  it("returns false when bot id is missing", () => {
    expect(
      shouldShowTelegramLogin({
        is_telegram_login_on: true,
        telegram_bot_id: null,
      } as never),
    ).toBe(false);
  });

  it("returns true when login is enabled and bot id exists", () => {
    expect(
      shouldShowTelegramLogin({
        is_telegram_login_on: true,
        telegram_bot_id: "12345",
      } as never),
    ).toBe(true);
  });
});

describe("shouldShowGoogleLogin", () => {
  it("returns false when login flag is off", () => {
    expect(
      shouldShowGoogleLogin({
        is_google_login_on: false,
      } as never),
    ).toBe(false);
  });

  it("returns true when login is enabled", () => {
    expect(
      shouldShowGoogleLogin({
        is_google_login_on: true,
      } as never),
    ).toBe(true);
  });
});

describe("getEnabledSocialProviders", () => {
  it("returns enabled providers in order", () => {
    expect(
      getEnabledSocialProviders({
        is_microsoft_on: true,
        app_id: "ms-client",
        authority: "https://login.microsoftonline.com/common",
        is_telegram_login_on: true,
        telegram_bot_id: "999",
        is_google_login_on: true,
      } as never),
    ).toEqual(["microsoft", "telegram", "google"]);
  });
});

describe("buildGoogleLoginStartUrl", () => {
  it("builds backend login start URL with return origin", () => {
    const url = buildGoogleLoginStartUrl({
      remember: true,
      returnOrigin: "https://school.example.com",
      returnPath: "/login",
      apiBaseUrl: "http://localhost:8000/api/v1/",
    });
    expect(url).toBe(
      "http://localhost:8000/api/v1/google/oauth/start/login?return_origin=https%3A%2F%2Fschool.example.com&return_path=%2Flogin&remember=true",
    );
  });
});

describe("parseGoogleOAuthReturn", () => {
  it("parses handoff code", () => {
    expect(
      parseGoogleOAuthReturn(new URLSearchParams({ google_handoff: "abc123" })),
    ).toEqual({ handoffCode: "abc123" });
  });

  it("parses oauth error params", () => {
    expect(
      parseGoogleOAuthReturn(
        new URLSearchParams({
          google_oauth: "error",
          google_oauth_message: "google_not_linked",
          google_oauth_details: "No account linked.",
        }),
      ),
    ).toEqual({
      errorCode: "google_not_linked",
      errorDetails: "No account linked.",
    });
  });

  it("parses link success", () => {
    expect(
      parseGoogleOAuthReturn(new URLSearchParams({ google_oauth: "success" })),
    ).toEqual({ linkSuccess: true });
  });
});

describe("normalizeTelegramBotUsername", () => {
  it("strips leading @", () => {
    expect(normalizeTelegramBotUsername("@schoolbot")).toBe("schoolbot");
  });
});

describe("parseTelegramOAuthReturn", () => {
  it("parses telegram oauth query params", () => {
    const params = new URLSearchParams({
      id: "42",
      first_name: "Test",
      auth_date: "1700000000",
      hash: "abc123",
    });
    expect(parseTelegramOAuthReturn(params)).toEqual({
      id: 42,
      first_name: "Test",
      auth_date: 1700000000,
      hash: "abc123",
    });
  });

  it("returns null when required params are missing", () => {
    expect(parseTelegramOAuthReturn(new URLSearchParams("id=42"))).toBeNull();
  });
});

describe("parseTelegramOAuthHash", () => {
  const samplePayload = {
    id: 553691866,
    first_name: "Mashiromashi",
    username: "mashirromashi",
    photo_url:
      "https://t.me/i/userpic/320/aLtoaE_aMjkiTC6fecc50HVMFa_tST-TEPn1oVWLH0I.jpg",
    auth_date: 1786331295,
    hash: "f193944942deb6409d1c549b6093049914137fbc0e2eee4b6472c1287f9ab7ad",
  };

  const sampleHash = `#tgAuthResult=${Buffer.from(JSON.stringify(samplePayload)).toString("base64")}`;

  it("parses tgAuthResult hash fragment", () => {
    expect(parseTelegramOAuthHash(sampleHash)).toEqual({
      id: 553691866,
      first_name: "Mashiromashi",
      username: "mashirromashi",
      photo_url:
        "https://t.me/i/userpic/320/aLtoaE_aMjkiTC6fecc50HVMFa_tST-TEPn1oVWLH0I.jpg",
      auth_date: 1786331295,
      hash: "f193944942deb6409d1c549b6093049914137fbc0e2eee4b6472c1287f9ab7ad",
    });
  });

  it("parses production oauth.telegram.org redirect hash", () => {
    const productionHash =
      "#tgAuthResult=eyJpZCI6NTUzNjkxODY2LCJmaXJzdF9uYW1lIjoiTWFzaGlyb21hc2hpIiwidXNlcm5hbWUiOiJtYXNoaXJvbWFzaGkiLCJwaG90b191cmwiOiJodHRwczpcL1wvdC5tZVwvaVwvdXNlcnBpY1wvMzIwXC9hTHRvYUVfYU1qa2lUQzZmZWNjNTBIVk1GYV90U1QtVUVQbjFvVFdMSDBJLmpwZyIsImF1dGhfZGF0ZSI6MTc4NjMzMTI5NSwiaGFzaCI6ImYxOTM5NDQ5NDJkZWI2NDA5ZDFjNTQ5YjYwOTMwNDk5MTQxMzdmYmMwZTJlZWU0YjY0NzJjMTI4N2Y5YWI3YWQifQ";
    expect(parseTelegramOAuthHash(productionHash)).toMatchObject({
      id: 553691866,
      username: "mashiromashi",
      auth_date: 1786331295,
    });
  });

  it("returns null for empty hash", () => {
    expect(parseTelegramOAuthHash("")).toBeNull();
  });

  it("returns null for wrong prefix", () => {
    expect(parseTelegramOAuthHash("#other=abc")).toBeNull();
  });

  it("returns null for invalid base64", () => {
    expect(parseTelegramOAuthHash("#tgAuthResult=%%%")).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    const encoded = Buffer.from(JSON.stringify({ id: 1 })).toString("base64");
    expect(parseTelegramOAuthHash(`#tgAuthResult=${encoded}`)).toBeNull();
  });
});

describe("shouldShowMicrosoftLogin", () => {
  it("requires microsoft config", () => {
    expect(
      shouldShowMicrosoftLogin({
        is_microsoft_on: true,
        app_id: "abc",
        authority: "https://login.microsoftonline.com/common",
      } as never),
    ).toBe(true);
    expect(
      shouldShowMicrosoftLogin({
        is_microsoft_on: true,
        app_id: null,
        authority: "https://login.microsoftonline.com/common",
      } as never),
    ).toBe(false);
  });
});
