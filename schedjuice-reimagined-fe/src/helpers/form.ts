"use client";

import type { FormEvent } from "react";
import type {
  FieldErrors,
  FieldPath,
  FieldValues,
  UseFormReturn,
} from "react-hook-form";

function fieldMessagesFromDetail(raw: unknown): string {
  if (raw == null) return "";
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x)).join(", ");
  }
  return String(raw);
}

/** Extract Microsoft Graph `error.message` from an MS_ERROR payload. */
/** True when the API reports a Microsoft license availability/config block. */
export function isMicrosoftLicenseBlocked(error: unknown): boolean {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (data == null || typeof data !== "object") return false;

  const record = data as Record<string, unknown>;
  if (record.license_blocked === true) return true;

  const details = record.details;
  if (details != null && typeof details === "object" && !Array.isArray(details)) {
    return (details as Record<string, unknown>).license_blocked === true;
  }

  return false;
}

export function extractMicrosoftGraphErrorMessage(msError: unknown): string | null {
  if (msError == null || typeof msError !== "object") return null;
  const payload = msError as { error?: { message?: unknown } };
  const message = payload.error?.message;
  if (typeof message !== "string") return null;
  const trimmed = message.trim();
  return trimmed || null;
}

/** Map Graph provisioning messages to a form field when possible. */
export function mapMicrosoftErrorToFormField(message: string): string | null {
  const lower = message.toLowerCase();
  if (
    lower.includes("userprincipalname") ||
    /\bupn\b/.test(lower) ||
    (lower.includes("already exists") &&
      (lower.includes("property") || lower.includes("same value")))
  ) {
    return "email";
  }
  return null;
}

function applyMicrosoftFormError<T extends FieldValues>(
  formInstance: UseFormReturn<T>,
  msError: unknown
): boolean {
  const message = extractMicrosoftGraphErrorMessage(msError);
  if (!message) return false;

  const field = mapMicrosoftErrorToFormField(message);
  if (field) {
    formInstance.setError(field as FieldPath<T>, { type: "server", message });
    return true;
  }

  formInstance.setError("root" as FieldPath<T>, { type: "server", message });
  return true;
}

/** Preferred scroll order for the user create/edit form (top to bottom). */
export const USER_FORM_FIELD_SCROLL_ORDER: string[] = [
  "name",
  "alternative_name",
  "email",
  "communication_email",
  "gender",
  "date_of_birth",
  "phone_number",
  "roles",
  "code",
  "facebook_account_link",
  "country",
  "region",
  "city",
  "township",
  "house_number",
  "street",
  "preferred_checkin_time",
  "preferred_checkout_time",
  "access_log_name",
  "working_hour_per_month",
  "salary",
  "per_session_rate",
  "per_hour_rate",
  "student_bonus_hourly_rate",
  "contract_expiry_date",
  "probation_end_date",
  "employment_start_date",
  "employment_type",
  "zoom_user_identifier",
];

function sortErrorFieldNames(keys: string[]): string[] {
  const orderIndex = new Map(
    USER_FORM_FIELD_SCROLL_ORDER.map((k, i) => [k, i] as const)
  );
  return [...keys].sort((a, b) => {
    const ai = orderIndex.get(a);
    const bi = orderIndex.get(b);
    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;
    if (a.startsWith("custom_data.") && b.startsWith("custom_data.")) {
      return a.localeCompare(b);
    }
    if (a.startsWith("custom_data.")) return 1;
    if (b.startsWith("custom_data.")) return -1;
    return a.localeCompare(b);
  });
}

function escapeFieldName(fieldName: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(fieldName);
  }
  return fieldName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isHtmlElement(node: unknown): node is HTMLElement {
  return (
    node != null &&
    typeof node === "object" &&
    typeof (node as HTMLElement).scrollIntoView === "function"
  );
}

function findFieldElement(
  fieldName: string,
  root: ParentNode = document
): HTMLElement | null {
  const escaped = escapeFieldName(fieldName);
  const byData = root.querySelector(`[data-field-name="${escaped}"]`);
  if (isHtmlElement(byData)) {
    return byData;
  }

  const byName = root.querySelector(`[name="${escaped}"]`);
  if (isHtmlElement(byName)) {
    return byName.closest(".space-y-2") ?? byName;
  }

  if (fieldName === "root") {
    const rootMessage = root.querySelector("[data-form-root-error]");
    if (isHtmlElement(rootMessage)) return rootMessage;
  }

  return null;
}

export const FORM_ERROR_HIGHLIGHT_ATTR = "data-form-error-highlight";
export const FORM_ERROR_HIGHLIGHT_DURATION_MS = 2000;

const NATIVE_INVALID_CONTROL_SELECTOR =
  'input:not([type="hidden"]):invalid, textarea:invalid, select:invalid';

const FOCUSABLE_FIELD_SELECTOR =
  'input:not([type="hidden"]), textarea, select, button[role="combobox"], [data-field-focus]';

const highlightTimeouts = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/** Apply a short-lived highlight marker to a field container. */
export function applyFormFieldErrorHighlight(element: HTMLElement): void {
  element.setAttribute(FORM_ERROR_HIGHLIGHT_ATTR, "true");

  const existing = highlightTimeouts.get(element);
  if (existing != null) {
    clearTimeout(existing);
  }

  const timeoutId = setTimeout(() => {
    element.removeAttribute(FORM_ERROR_HIGHLIGHT_ATTR);
    highlightTimeouts.delete(element);
  }, FORM_ERROR_HIGHLIGHT_DURATION_MS);

  highlightTimeouts.set(element, timeoutId);
}

function resolveFieldContainer(control: HTMLElement): HTMLElement {
  return (
    control.closest("[data-field-name]") ??
    control.closest(".space-y-2") ??
    control
  );
}

function asHtmlFormElement(form: unknown): HTMLFormElement | null {
  if (form == null || typeof form !== "object") return null;

  const candidate = form as HTMLElement;
  if (
    candidate.tagName === "FORM" &&
    typeof (candidate as HTMLFormElement).querySelector === "function"
  ) {
    return candidate as HTMLFormElement;
  }

  if (typeof candidate.closest === "function") {
    const closestForm = candidate.closest("form");
    if (
      closestForm &&
      typeof (closestForm as HTMLFormElement).querySelector === "function"
    ) {
      return closestForm as HTMLFormElement;
    }
  }

  return null;
}

/** Focus the primary control inside a field container. */
export function focusFormFieldTarget(target: HTMLElement): void {
  const focusable =
    typeof target.matches === "function" &&
    target.matches(FOCUSABLE_FIELD_SELECTOR) &&
    typeof (target as HTMLInputElement).focus === "function"
      ? target
      : target.querySelector<HTMLElement>(FOCUSABLE_FIELD_SELECTOR);

  if (focusable && typeof focusable.focus === "function") {
    focusable.focus({ preventScroll: true });
  }
}

/** Scroll to, focus, and highlight a field container. */
export function scrollToFormFieldTarget(target: HTMLElement): void {
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  focusFormFieldTarget(target);
  applyFormFieldErrorHighlight(target);
}

/** Find the first native invalid control inside a form. */
export function findFirstNativeInvalidControl(
  form: HTMLFormElement
): HTMLElement | null {
  const invalid = form.querySelector<HTMLElement>(NATIVE_INVALID_CONTROL_SELECTOR);
  return invalid ?? null;
}

/** Scroll to the first browser-native invalid field inside a form. */
export function scrollToNativeFormInvalid(
  form: HTMLFormElement | EventTarget | null | undefined
): boolean {
  const formEl = asHtmlFormElement(form);
  if (!formEl) return false;

  const invalidControl = findFirstNativeInvalidControl(formEl);
  if (!invalidControl) return false;

  scrollToFormFieldTarget(resolveFieldContainer(invalidControl));
  return true;
}

/** Handle native constraint validation without suppressing browser messages. */
export function handleNativeFormInvalid(event: FormEvent<HTMLFormElement>): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  requestAnimationFrame(() => {
    scrollToNativeFormInvalid(target.closest("form"));
  });
}

/** Scroll after a named field (via data-field-name) is marked invalid. */
export function scheduleScrollToFieldByName(
  fieldName: string,
  options?: { root?: ParentNode }
): void {
  requestAnimationFrame(() => {
    const target = findFieldElement(fieldName, options?.root ?? document);
    if (target) scrollToFormFieldTarget(target);
  });
}

/** Scroll after RHF/server errors are written into form state. */
export function scheduleScrollToFirstFormError(
  formInstance: Pick<UseFormReturn<FieldValues>, "formState">,
  options?: { root?: ParentNode }
): void {
  requestAnimationFrame(() => {
    scrollToFirstFormError(formInstance, options);
  });
}

/** Scroll to and focus the first field with a validation error. Returns true if a target was found. */
export function scrollToFirstFormError(
  formInstance: Pick<UseFormReturn<FieldValues>, "formState">,
  options?: { root?: ParentNode }
): boolean {
  const errors = formInstance.formState.errors as FieldErrors;
  if (!errors || typeof errors !== "object") return false;

  const keys = sortErrorFieldNames(
    Object.keys(errors).filter((key) => {
      const err = errors[key as keyof typeof errors];
      return err != null && (key === "root" || key.length > 0);
    })
  );

  const searchRoot = options?.root ?? document;

  for (const key of keys) {
    const target = findFieldElement(key, searchRoot);
    if (!target) continue;

    scrollToFormFieldTarget(target);
    return true;
  }

  return false;
}

/**
 * Apply API validation errors to a react-hook-form instance.
 * Returns true when at least one error was applied.
 */
export const setFormErrrors = <T extends FieldValues>(
  mutationErorrObject: unknown,
  formInstance: UseFormReturn<T>,
  onMSError: (errorMsg: string) => void = () => {}
): boolean => {
  const data = (mutationErorrObject as { response?: { data?: unknown } })
    ?.response?.data;
  if (data == null || typeof data !== "object") {
    return false;
  }

  const record = data as Record<string, unknown>;
  let applied = false;

  if ("MS_ERROR" in record) {
    applied = applyMicrosoftFormError(formInstance, record.MS_ERROR) || applied;
    if (applied && !mapMicrosoftErrorToFormField(
      extractMicrosoftGraphErrorMessage(record.MS_ERROR) ?? ""
    )) {
      const msg = extractMicrosoftGraphErrorMessage(record.MS_ERROR);
      if (msg) onMSError(msg);
    }
    return applied;
  }

  const details = record.details;
  if (details == null || typeof details !== "object" || Array.isArray(details)) {
    return applied;
  }

  const detailsRecord = details as Record<string, unknown>;

  if ("MS_ERROR" in detailsRecord) {
    const msApplied = applyMicrosoftFormError(
      formInstance,
      detailsRecord.MS_ERROR
    );
    applied = msApplied || applied;
    if (msApplied) {
      const msg = extractMicrosoftGraphErrorMessage(detailsRecord.MS_ERROR);
      const mappedField = msg ? mapMicrosoftErrorToFormField(msg) : null;
      if (msg && !mappedField) onMSError(msg);
    }
  }

  for (const key of Object.keys(detailsRecord)) {
    if (key === "MS_ERROR") continue;

    const message = fieldMessagesFromDetail(detailsRecord[key]);
    if (!message) continue;

    if (key === "non_field_errors" || key === "detail") {
      formInstance.setError("root" as FieldPath<T>, {
        type: "server",
        message,
      });
      applied = true;
      continue;
    }

    formInstance.setError(key as FieldPath<T>, { type: "server", message });
    applied = true;
  }

  return applied;
};

export const getNonFieldErrorMessage = (mutationErorrObject: unknown) => {
  const nonField = (mutationErorrObject as { response?: { data?: { non_field_errors?: string[] } } })
    ?.response?.data?.non_field_errors;
  return nonField?.join(", ");
};
