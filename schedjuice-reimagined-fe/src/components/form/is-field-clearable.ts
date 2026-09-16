export function isFieldClearable(opts: {
  clearable?: boolean;
  required?: boolean;
}): boolean {
  return opts.clearable ?? opts.required === false;
}
