import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Field isolation gate (F0): root must not call whole-form watch();
 * AutoFormField must stay memoized and subscribe per-field only.
 *
 * React Profiler acceptance (manual / PR): typing in field A must not
 * re-render field B’s memoized AutoFormField boundary.
 */
describe("auto-form field isolation", () => {
  const root = resolve(__dirname, "..");

  it("auto-form.tsx does not call form.watch() without a field name", () => {
    const src = readFileSync(resolve(root, "auto-form.tsx"), "utf8");
    // Ban whole-form watch at the root (the legacy AutoFormObject anti-pattern).
    expect(src).not.toMatch(/form\.watch\s*\(\s*\)/);
    expect(src).not.toMatch(/\.watch\(\s*\)/);
  });

  it("use-auto-form.ts does not call whole-form watch()", () => {
    const src = readFileSync(resolve(root, "use-auto-form.ts"), "utf8");
    expect(src).not.toMatch(/form\.watch\s*\(\s*\)/);
    expect(src).not.toMatch(/\.watch\(\s*\)/);
  });

  it("AutoFormField is memoized and uses Controller for a single name", () => {
    const src = readFileSync(resolve(root, "auto-form-field.tsx"), "utf8");
    expect(src).toMatch(/memo\s*\(\s*AutoFormFieldInner\s*\)/);
    expect(src).toMatch(/Controller/);
    expect(src).toMatch(/name=\{name\}/);
    // Prefer useFormState scoped to name over formState wholesale if present.
    expect(src).toMatch(/useFormState\s*\(\s*\{\s*control,\s*name\s*\}/);
  });

  it("AutoForm wires bindFieldBlur into groups (Select/Radio/Checkbox path)", () => {
    const src = readFileSync(resolve(root, "auto-form.tsx"), "utf8");
    expect(src).toMatch(/onFieldBlur=\{autosaveEnabled \? bindFieldBlur/);
    expect(src).toMatch(/AutosaveProvider/);
  });
});
