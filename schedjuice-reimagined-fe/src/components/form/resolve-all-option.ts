export type AllOptionValue = { value: string; label: string };

export function resolveAllOption(opts: {
  emptyOption?: AllOptionValue;
  allOption?: boolean | string;
  placeholder?: string;
  allowDeselect?: boolean;
}): AllOptionValue | undefined {
  if (opts.emptyOption) return opts.emptyOption;
  if (opts.allOption === false) return undefined;
  if (typeof opts.allOption === "string") {
    return { value: "", label: opts.allOption };
  }
  if (opts.allOption === true) {
    return { value: "", label: opts.placeholder || "All" };
  }
  if (opts.allowDeselect !== false && /^All\b/i.test(opts.placeholder ?? "")) {
    return { value: "", label: opts.placeholder as string };
  }
  return undefined;
}
