import { Controller, type FieldValues, type UseFormReturn } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyFormFieldErrorHighlight,
  extractMicrosoftGraphErrorMessage,
  FORM_ERROR_HIGHLIGHT_ATTR,
  mapMicrosoftErrorToFormField,
  scrollToFirstFormError,
  scrollToFormFieldTarget,
  scrollToNativeFormInvalid,
  setFormErrrors,
} from "./form";

describe("extractMicrosoftGraphErrorMessage", () => {
  it("reads nested Graph error message", () => {
    expect(
      extractMicrosoftGraphErrorMessage({
        error: {
          code: "Request_BadRequest",
          message:
            "Another object with the same value for property userPrincipalName already exists.",
        },
      })
    ).toBe(
      "Another object with the same value for property userPrincipalName already exists."
    );
  });

  it("returns null for invalid payloads", () => {
    expect(extractMicrosoftGraphErrorMessage(null)).toBeNull();
    expect(extractMicrosoftGraphErrorMessage({})).toBeNull();
  });
});

describe("mapMicrosoftErrorToFormField", () => {
  it("maps duplicate UPN messages to email", () => {
    expect(
      mapMicrosoftErrorToFormField(
        "Another object with the same value for property userPrincipalName already exists."
      )
    ).toBe("email");
  });

  it("returns null for unrelated Graph errors", () => {
    expect(
      mapMicrosoftErrorToFormField("Insufficient privileges to complete the operation.")
    ).toBeNull();
  });
});

describe("setFormErrrors", () => {
  it("sets email error for MS_ERROR nested under details", () => {
    const setError = vi.fn();
    const form = { setError } as unknown as Parameters<typeof setFormErrrors>[1];

    const applied = setFormErrrors(
      {
        response: {
          data: {
            isError: true,
            details: {
              MS_ERROR: {
                error: {
                  message:
                    "Another object with the same value for property userPrincipalName already exists.",
                },
              },
            },
          },
        },
      },
      form
    );

    expect(applied).toBe(true);
    expect(setError).toHaveBeenCalledWith("email", {
      type: "server",
      message:
        "Another object with the same value for property userPrincipalName already exists.",
    });
  });

  it("sets root error for unmapped Microsoft errors", () => {
    const setError = vi.fn();
    const form = { setError } as unknown as Parameters<typeof setFormErrrors>[1];

    setFormErrrors(
      {
        response: {
          data: {
            details: {
              MS_ERROR: {
                error: { message: "Insufficient privileges to complete the operation." },
              },
            },
          },
        },
      },
      form
    );

    expect(setError).toHaveBeenCalledWith("root", {
      type: "server",
      message: "Insufficient privileges to complete the operation.",
    });
  });

  it("maps standard DRF field errors", () => {
    const setError = vi.fn();
    const form = { setError } as unknown as Parameters<typeof setFormErrrors>[1];

    setFormErrrors(
      {
        response: {
          data: {
            details: { name: ["This field may not be blank."] },
          },
        },
      },
      form
    );

    expect(setError).toHaveBeenCalledWith("name", {
      type: "server",
      message: "This field may not be blank.",
    });
  });
});

describe("scrollToFormFieldTarget", () => {
  it("scrolls, focuses, and highlights the target container", () => {
    const input = { focus: vi.fn() };
    const target = {
      scrollIntoView: vi.fn(),
      matches: vi.fn(() => false),
      querySelector: vi.fn(() => input),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    } as unknown as HTMLElement;

    scrollToFormFieldTarget(target);

    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    expect(input.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(target.setAttribute).toHaveBeenCalledWith(
      FORM_ERROR_HIGHLIGHT_ATTR,
      "true"
    );
  });
});

describe("applyFormFieldErrorHighlight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("removes highlight attribute after the timeout", () => {
    const target = {
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    } as unknown as HTMLElement;

    applyFormFieldErrorHighlight(target);
    expect(target.setAttribute).toHaveBeenCalledWith(
      FORM_ERROR_HIGHLIGHT_ATTR,
      "true"
    );

    vi.advanceTimersByTime(2000);
    expect(target.removeAttribute).toHaveBeenCalledWith(FORM_ERROR_HIGHLIGHT_ATTR);
  });
});

describe("scrollToFirstFormError", () => {
  it("scrolls to the first RHF error using data-field-name", () => {
    const input = { focus: vi.fn() };
    const fieldItem = {
      scrollIntoView: vi.fn(),
      matches: vi.fn(() => false),
      querySelector: vi.fn(() => input),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    };

    const root = {
      querySelector: vi.fn((selector: string) => {
        if (selector.includes('data-field-name="email"')) return fieldItem;
        return null;
      }),
    } as unknown as ParentNode;

    scrollToFirstFormError(
      {
        formState: {
          errors: {
            email: { type: "required", message: "Required" },
            name: { type: "required", message: "Required" },
          },
        },
      } as unknown as Pick<UseFormReturn<FieldValues>, "formState">,
      { root }
    );

    expect(fieldItem.scrollIntoView).toHaveBeenCalled();
    expect(input.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(fieldItem.setAttribute).toHaveBeenCalledWith(
      FORM_ERROR_HIGHLIGHT_ATTR,
      "true"
    );
  });

  it("scrolls to root error banner when root is the only error", () => {
    const rootBanner = {
      scrollIntoView: vi.fn(),
      matches: vi.fn(() => false),
      querySelector: vi.fn(() => null),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    };

    const root = {
      querySelector: vi.fn((selector: string) => {
        if (selector.includes("[data-form-root-error]")) return rootBanner;
        return null;
      }),
    } as unknown as ParentNode;

    scrollToFirstFormError(
      {
        formState: {
          errors: {
            root: { type: "server", message: "Plain discounts cannot set eligibility params." },
          },
        },
      } as unknown as Pick<UseFormReturn<FieldValues>, "formState">,
      { root }
    );

    expect(rootBanner.scrollIntoView).toHaveBeenCalled();
  });
});

describe("scrollToNativeFormInvalid", () => {
  it("scrolls to the container around the first invalid control", () => {
    const input: {
      focus: ReturnType<typeof vi.fn>;
      closest: (selector: string) => typeof container | null;
    } = {
      focus: vi.fn(),
      closest: vi.fn((selector: string) =>
        selector === "[data-field-name]" || selector === ".space-y-2"
          ? container
          : null
      ),
    };
    const container: {
      scrollIntoView: ReturnType<typeof vi.fn>;
      matches: ReturnType<typeof vi.fn>;
      querySelector: ReturnType<typeof vi.fn>;
      setAttribute: ReturnType<typeof vi.fn>;
      removeAttribute: ReturnType<typeof vi.fn>;
    } = {
      scrollIntoView: vi.fn(),
      matches: vi.fn(() => false),
      querySelector: vi.fn(() => input),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    };
    const form = {
      tagName: "FORM",
      querySelector: vi.fn(() => input),
    } as unknown as HTMLFormElement;

    const scrolled = scrollToNativeFormInvalid(form);

    expect(scrolled).toBe(true);
    expect(container.scrollIntoView).toHaveBeenCalled();
    expect(input.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
