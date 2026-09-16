# Schedjuice v2 — Forms Strategy

> **Audience:** the AI agent scaffolding the new Schedjuice frontend from scratch.
> **Reads with:** `2026-05-16-schedjuice-v2-design-brief.md` (design system) and `2026-05-17-schedjuice-v2-api-sdk-brief.md` (API SDK). This brief is the third leg of the foundation phase.
> **Greenfield rule:** do not import code, types, hooks, or patterns from the legacy `schedjuice-reimagined-fe/src/components/ui/auto-form.tsx` or `src/components/form/`. The few exceptions are named explicitly below (`FormDirtyBeforeUnload` is the only legacy form file that earns its keep). Everything else is rewritten.

---

## 1. What you're building

A forms layer for the rebuild that is simultaneously **DRY at the field level** and **opinionated per entity** — without falling back to the legacy `<AutoForm>` pattern that rendered every form from a Zod schema and produced 1080 lines of `ZodEffects` unwrapping plus an `inputProps` overrides bag at every call site.

The forms layer owns three things and nothing else:

1. A typed library of **Field primitives** (`TextField`, `SelectField`, `DateField`, …) that wrap Base UI primitives with React Hook Form integration.
2. A pattern for **per-entity hand-composed form components** (`CourseCreateForm`, `StudentEditForm`, …) that compose those primitives with deliberate layout, copy, grouping, and step semantics.
3. The seams to the rest of the system: Zod schemas for input validation, the DRF-error-to-form-error adapter, the bilingual Zod error map, and the `FormProvider` that ties everything together.

The forms layer does NOT own API calls, query keys, mutations, optimistic updates, retries, axios, or anything else network-shaped. That all lives in the SDK (`src/sdk/`); see the SDK brief.

---

## 2. The headline rule

> **Schemas validate. Forms compose.** The Zod schema is the source of truth for **validation and inferred input types** — never for **rendering**. Each entity owns its own hand-composed form component, built from a shared library of typed `Field` primitives. There is no schema-driven renderer. If you find yourself walking a Zod schema to decide what JSX to emit, stop — you are reinventing AutoForm.

This is the rule everything else in the brief enforces.

---

## 3. Libraries

| Concern | Library | Notes |
|---|---|---|
| Schema / validation | **`zod@4`** | Stable since Oct 2024. ~50% smaller bundle than Zod 3, much faster TS inference at scale, JSON Schema export in core. Custom error map used for bilingual messages. |
| Form state | **`react-hook-form@7`** + `@hookform/resolvers/zod` | Uncontrolled-by-default, fast, mature resolver story. Underneath the typed Field primitives — form authors never import RHF directly. |
| UI primitives | `@base-ui-components/react` | Mandated by design brief §10. Fields wrap Base UI's `Field.Root` / `Field.Label` / `Field.Control` / `Field.Description` / `Field.Error`. |

**Explicitly NOT used:**

- ❌ TanStack Form, Conform, Formik, Final Form, React Final Form — none of them.
- ❌ Yup, Valibot, ArkType, Joi — none of them.
- ❌ The legacy `src/components/ui/auto-form.tsx` — deleted, not ported.

---

## 4. Architecture — the three-tier stack

The Field primitive layer sits **above** the §13.2 UI primitives and **below** the entity forms. Three tiers total:

```
                              consumes
src/entities/<name>/forms/  ─────────────►  src/components/fields/
        (hand-composed)                       (RHF-aware Fields)
                                                       │ consumes
                                                       ▼
                                              src/components/primitives/
                                              (Base UI wrappers, §13.2)
                                                       │ consumes
                                                       ▼
                                              @base-ui-components/react
```

Each layer has a clear job. **Entity forms** compose. **Fields** wire validation + label/error scaffolding around primitives. **Primitives** are stylable, unstyled-ish Base UI wrappers with no form awareness.

A field never reaches into the form state directly without going through its prop interface. A form never renders a raw Base UI primitive — always go through the field layer. Crossing layers is a banned-list violation.

---

## 5. Amendment to design brief §13.2

The design brief lists 21 foundation primitives under §13.2. **Rename item 4** to free up the name `NumberField` for the form-aware layer:

| §13.2 was | §13.2 becomes |
|---|---|
| `NumberField` (Base UI primitive) | `NumberInput` (Base UI primitive) |

Every other §13.2 name is unaffected. The form-aware `NumberField` (forms layer, this brief) wraps the renamed `NumberInput` (primitives layer, design brief).

---

## 6. File layout

The forms layer touches three trees: `src/components/fields/`, `src/lib/forms/`, and `src/entities/<name>/`. The SDK owns `src/sdk/`; the design system owns `src/components/primitives/` and `src/components/decoration/`. No file in this brief introduces an `api.ts`, `keys.ts`, `mutations.ts`, or any other API surface — those belong to the SDK.

```
src/
  components/
    fields/                              # forms layer — RHF-aware Field primitives
      index.ts                           # single re-export surface
      text-field.tsx
      textarea-field.tsx
      number-field.tsx
      select-field.tsx
      combobox-field.tsx
      multi-combobox-field.tsx
      checkbox-field.tsx
      checkbox-group-field.tsx
      switch-field.tsx
      radio-group-field.tsx
      slider-field.tsx
      date-field.tsx
      date-range-field.tsx
      date-time-field.tsx
      form-provider.tsx                  # wraps RHF FormProvider + bilingual error map
      form-section.tsx
      field-group.tsx
      field-row.tsx
      form-error-summary.tsx             # surfaces root errors (DRF non_field_errors)
      form-footer.tsx
      form-stepper.tsx
      form-dirty-before-unload.tsx       # ported from legacy

  lib/
    forms/
      use-drf-errors.ts                  # SDK ApiError → RHF setError mapping
      use-zod-field-meta.ts              # derives required/optional/min/max from Zod
      assert-schema-matches-sdk.ts       # compile-time assert util
    zod-i18n.ts                          # global Zod custom error map (Burmese + English)

  entities/
    course/
      schema.ts                          # Zod schemas + courseDefaults
      forms/
        course-create-form.tsx
        course-edit-form.tsx
      components/                        # display components (CourseCard, CourseRange)
      hooks/                             # entity-specific business/UI hooks ONLY
                                         # (NEVER raw API — those live in the SDK)
    student/
      ...
    quiz/
      ...
```

Most entities will have **`schema.ts` and `forms/` only**; `components/` appears when display logic is non-trivial, `hooks/` appears when there are genuine business-rule helpers (`useCanEditCourse`). For pure CRUD entities (Campus, Subject, Category), the entity folder is just `schema.ts` + `forms/`.

---

## 7. The Field primitive surface

Every field has the same internal structure:

```
Field.Root (name + invalid)
  ├─ Field.Label (with required asterisk or " · optional" suffix)
  ├─ Field.Control render={(props) => <PrimitiveFromDesignBrief {...props} />}
  ├─ Field.Description (optional, ReactNode)
  └─ Field.Error (min-h reserved to prevent layout shift)
```

The min-height reservation under `Field.Error` is the one good UX choice carried over from the legacy auto-form: error messages never push the form down when they appear. This is a hard requirement — no field omits it.

### 7.1 Atomic fields (foundation phase ships all of these)

| Field | Wraps primitive | Typical Zod | Notes |
|---|---|---|---|
| `TextField` | `Input` | `ZodString` | props: `name`, `label`, `description`, `placeholder`, `autoComplete`, `size`, `disabled` |
| `TextareaField` | `Textarea` | `ZodString` | props add: `rows`, `autoResize` |
| `NumberField` | `NumberInput` (renamed from §13.2) | `ZodNumber` | props add: `unit` slot (`MMK`, `%`, `hrs`), `step`, `min`, `max` |
| `SelectField` | `Select` | `ZodEnum` / `ZodNativeEnum` | options are **explicit** — `options: Array<{ value; label; description? }>`; never auto-derived from a Zod enum |
| `ComboboxField` | `Combobox` | `ZodEnum` / `ZodString` | client-side filter, single value |
| `MultiComboboxField` | `Combobox` | `ZodArray(ZodEnum)` | chip readout + clear-all |
| `CheckboxField` | `Checkbox` | `ZodBoolean` | label-right, description-below |
| `CheckboxGroupField` | `Checkbox` | `ZodArray(ZodEnum)` | known set of options |
| `SwitchField` | `Switch` | `ZodBoolean` | **settings affordance only** — never for required toggles in a create flow |
| `RadioGroupField` | `RadioGroup` | `ZodEnum` | vertical stack, each option has label + optional description |
| `SliderField` | `Slider` | `ZodNumber` | tabular-number readout in IBM Plex Mono |
| `DateField` | `Popover` + custom calendar | `ZodDate` / `ZodString` (ISO) | dual-renders Gregorian + Myanmar calendar inside the popover |
| `DateRangeField` | same | `ZodObject({start, end})` | single popover, two columns |
| `DateTimeField` | same + time field | `ZodDate` | timezone-aware via `@internationalized/date` |

### 7.2 Compositional pieces (also foundation)

| Component | Job |
|---|---|
| `FormProvider` | Wraps RHF's `FormProvider` and installs the bilingual Zod error map on mount. Takes `form`, `onSubmit`, optional `isLoading`, optional `id`. Renders a `<form>` element internally. |
| `FormSection` | Titled section. Props: `title`, optional `description`, optional `aside` slot. The unit of vertical rhythm inside a form. |
| `FieldGroup` | Semantic `<fieldset>` + `<legend>` for genuinely related fields (`start_date` + `end_date`). Legend rendered in small-caps Latin-only style from the design brief; falls through to non-uppercase if Burmese is detected (design brief §7). |
| `FieldRow` | Horizontal pair/triple for narrow inputs (`code` + `batch_number`). Stacks vertically on mobile. |
| `FormErrorSummary` | Root-level error display, where DRF `non_field_errors` / `detail` land. Renders via `form.formState.errors.root?.message`. |
| `FormFooter` | Sticky bottom container. Props: `primary: { label, isLoading, type? }`, `secondary?: { label, href? \| onClick? }`, optional `statusText` (live-region) for "Unsaved" / "Saving…" / "Saved" states. |
| `FormStepper` | Multi-step flows. See §10. |
| `FormDirtyBeforeUnload` | Beforeunload prompt when form is dirty. Ported from legacy as-is. |

### 7.3 Out-of-scope composites (foundation does NOT ship these; later phases will)

Named here so the agent doesn't accidentally invent a different convention later:

- `EntityComboboxField` — searches a Django collection. Inherits `ComboboxField` props; adds `entity`, `queryParams`, `displayFunction`. Consumes `sdk.<resource>.list()`.
- `EntitySelectField` — small fixed Django list (payment plans, roles).
- `CurrencyAmountField` — `djmoney` integration, IBM Plex Mono tabular numbers, currency suffix.
- `FileUploadField` — `tus-js-client` chunked upload, drag-drop, preview.
- `RichTextField` — TipTap-backed (already a dependency).
- `MyanmarCalendarDateField` — `DateField` variant with dual Burmese + Gregorian display (uses `mm-cal-js`).
- `MyanmarAddressField` — region/township cascading selects.

These all follow the same Field API conventions (§8). The foundation phase delivers the atomic + compositional fields; the second phase adds these composites.

---

## 8. Field API conventions (the rules every field follows)

These rules are non-negotiable. They are what stops the forms layer from drifting back into AutoForm-shaped magic.

1. **`name` is type-narrowed** against the form's `TFieldValues` via RHF's `FieldPath<T>`. Wrong field names are a TypeScript error, never a runtime surprise.
2. **`label` is always required.** No "beautified from camelCase" fallback. The auto-form trick of `course_title` → `Course Title` is broken in Burmese and silent on i18n. Every field author types every label.
3. **`required` is auto-derived from the Zod schema** via `useZodFieldMeta(name)`. An explicit `required` prop overrides. The visual indicator (`*` for required, `· optional` for not) is rendered by the field itself, not by the form author.
4. **`description` accepts `ReactNode`**, never just a string. Mixed Burmese + Latin, inline links, and inline marks all need to work.
5. **Error rendering is owned by the field.** The form author never writes `<FormMessage />` manually. The reserved min-height under `Field.Error` is non-negotiable.
6. **No `inputProps` / `fieldConfigItem` / `fieldType` escape hatches.** If a field doesn't fit a case, write a new field. Don't pass an overrides bag. If a new field looks one-off, wait for the second consumer before extracting it.
7. **Fields read `form` from `useFormContext()` internally.** Form authors never pass `control` or `form` as a prop.
8. **Fields ship `isLoading` skeleton mode**, driven by `<FormProvider isLoading>` via context. Form authors write the same JSX; the skeleton state is automatic. Used for edit forms while initial data is fetching.

---

## 9. Form input schemas (Zod) and the SDK boundary

Two distinct schema concepts, kept separate:

- **SDK types** live in `src/sdk/_types/<resource>.ts`. They describe the **wire payload** the backend accepts and returns. One source of truth: the Django serializer. The SDK brief governs how these are written.
- **Form Zod schemas** live in `src/entities/<name>/schema.ts`. They describe **what the user must enter**, with FE-only rules ("title at least 1 char"), bilingual error messages, and per-form variation (create vs edit vs quick-add can differ). They produce values that should satisfy the SDK's create/update body types.

These are kept in sync by a compile-time assertion in every entity schema file:

```ts
import { z } from "zod";
import type { CourseCreateBody } from "@/sdk/_types/courses";

export const courseCreateSchema = z.object({
  title: z.string().min(1, "Class needs a title"),
  description: z.string().optional(),
  start_date: z.coerce.date(),
  end_date: z.coerce.date(),
  payment_plan: z.number().int().positive(),
  /* … */
});

export type CourseCreateInput = z.infer<typeof courseCreateSchema>;

export const courseDefaults: Partial<CourseCreateInput> = {
  title: "",
  description: "",
};

// Compile-time drift guard. If the SDK type changes (because the serializer changed),
// this assertion fails at build time, forcing the schema to be updated.
import { assertSchemaMatchesSdk } from "@/lib/forms/assert-schema-matches-sdk";
type _Assert = ReturnType<typeof assertSchemaMatchesSdk<CourseCreateInput, CourseCreateBody>>;
```

The assertion is one type alias per schema file. Add it once, forget about it, get a loud error if the contract drifts.

**Default values are explicit.** Each entity exports `<entity>Defaults: Partial<TInput>`. There is no `getDefaults(schema)` helper that walks the Zod schema at runtime — that was magic the legacy auto-form forced you to debug. Explicit defaults are typed, readable, and easy to vary per form (create vs edit can use different defaults).

---

## 10. Multi-step forms

Most forms are single-step (one or several `<FormSection>`s stacked). For genuinely multi-step flows (course creation, quiz authoring, onboarding wizards), use `<FormStepper>`:

```tsx
<FormStepper
  steps={[
    { id: "basics",   title: "Class basics",  fields: ["title", "description"] },
    { id: "schedule", title: "Schedule",      fields: ["start_date", "end_date"] },
    { id: "details",  title: "Class details", fields: ["payment_plan", "code"] },
    { id: "review",   title: "Review",        fields: [] },
  ]}
>
  {(step) => (
    step.id === "basics"   ? <BasicsStep />   :
    step.id === "schedule" ? <ScheduleStep /> :
    step.id === "details"  ? <DetailsStep />  :
                              <ReviewStep />
  )}
</FormStepper>
```

`<FormStepper>` owns:

- Step state (which step is active).
- Per-step validation (`form.trigger(step.fields)` on Next).
- Keyboard navigation between steps.
- Focus-the-first-errored-field on submit failure, jumping to whichever step contains it.
- The visible step indicator (rendered in the brief's style — small-caps Latin step titles, tabular-numbered step counts).

Each step component is a thin JSX shard that composes the same Field primitives. Step components do not call `useForm` — they consume the parent's form via `useFormContext`.

**Default to single-step.** Reach for the stepper only when the flow has a real "review" / "lock-in" / "this is irreversible" semantic. A long form is not a multi-step form.

---

## 11. Bilingual error messages

One global Zod custom error map lives in `src/lib/zod-i18n.ts`. It maps `ZodIssueCode` to keyed Burmese + English strings. The active language is read from the i18n layer (`useLocale()`) at the `FormProvider` boundary and installed via `z.setErrorMap()` for the mount lifetime.

Field primitives never call `t()` themselves. The schema layer is where translation lives. This means:

- A `z.string().min(1)` with no custom message produces "This field is required" in English or "ဤအချက်အလက် လိုအပ်သည်" in Burmese, automatically, with no per-field code. The default English/Burmese strings for each `ZodIssueCode` live in the error map.
- A custom message passed to `.min(1, "Class needs a title")` is treated as a **fallback English literal** in the foundation phase. When the i18n pass lands, custom messages migrate to dotted translation keys (`course.title.required`) that the error map resolves; until then, write clear English literals.
- The `FormErrorSummary` (root-level DRF errors) goes through the same map; backend error codes are translated to user-facing strings.

In the foundation phase, ship the English map only. The Burmese map is a known follow-up (§16) and integrates with the broader i18n pass.

---

## 12. DRF backend error mapping

The legacy `setFormErrrors` (typo and all) becomes `useDrfErrors(form)` — a hook that takes the SDK's `ApiError` and routes:

- `error.details.<field>` → `form.setError(field, { message })`
- `error.details.non_field_errors` (or `error.detail`) → `form.setError("root", { message })`

It lives at `src/lib/forms/use-drf-errors.ts` — a **forms-side adapter** that consumes the SDK's `ApiError` type. The SDK stays oblivious to React Hook Form; the forms layer owns the mapping.

Every form mutation calls it in `onError`:

```ts
const drfErrors = useDrfErrors(form);
const { mutate } = useCreateCourse({ onError: drfErrors });
```

**Skipping `useDrfErrors` in any mutation `onError` is a banned-list violation.** Backend errors must always make it back into the form so the user sees them next to the offending field.

For multi-step forms, `useDrfErrors` also calls `<FormStepper>`'s `goToFieldStep(fieldKey)` so the errored field's step is auto-selected and the field is focused. The plumbing for this is one extra arg: `useDrfErrors(form, { stepper })`.

---

## 13. The "good form" pattern — what every entity form looks like

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  FormProvider,
  FormSection,
  FieldGroup,
  FieldRow,
  FormErrorSummary,
  FormFooter,
  FormDirtyBeforeUnload,
  TextField,
  TextareaField,
  DateField,
} from "@/components/fields";

import { courseCreateSchema, courseDefaults } from "@/entities/course/schema";
import { useCreateCourse } from "@/sdk/resources/courses";
import { useDrfErrors } from "@/lib/forms/use-drf-errors";

export function CourseCreateForm() {
  const form = useForm({
    resolver: zodResolver(courseCreateSchema),
    defaultValues: courseDefaults,
  });
  const drfErrors = useDrfErrors(form);

  const { mutate, isPending } = useCreateCourse({
    onError: drfErrors,
    onSuccess: () => { /* toast + navigate; handled by the SDK hook layer */ },
  });

  return (
    <FormProvider form={form} onSubmit={mutate}>
      <FormDirtyBeforeUnload />

      <FormSection
        title="Class basics"
        description="Name your class. You can change everything later."
      >
        <TextField name="title" label="Class title" />
        <TextareaField name="description" label="Description" />
      </FormSection>

      <FormSection title="Schedule">
        <FieldGroup legend="Dates">
          <FieldRow>
            <DateField name="start_date" label="Starts" />
            <DateField name="end_date" label="Ends" />
          </FieldRow>
        </FieldGroup>
      </FormSection>

      <FormErrorSummary />

      <FormFooter
        primary={{ label: "Create class", isLoading: isPending }}
        secondary={{ label: "Cancel", href: "/courses" }}
      />
    </FormProvider>
  );
}
```

Compare to the legacy `course-create-form.tsx`: 788 lines, six inline `fieldType` lambdas, schema-driven render walking, hand-rolled stepper, `as any` casts, manual DRF error mapping, axios called from inside the component. The new pattern reads **top to bottom in one pass**, every field is typed against the schema, every label is explicit, and no API code lives in the form file.

The DRY-ness comes from the Field primitives, not from the form authoring.

---

## 14. Banned list — forms addendum to design brief §14

In addition to design brief §14:

1. **No schema-driven form renderer.** No `<AutoForm>`, no `<EntityForm schema={s} />`, no `<Form.Auto />`, no "given a Zod schema, render fields." Each entity's form is a typed, hand-composed component. This is the entire point of the strategy.
2. **No `fieldType: (props) => <Custom />` lambdas anywhere.** If a needed field doesn't exist, add it to `src/components/fields/` and give it a proper API. The lambdas are how AutoForm went from "DRY" to "1080 lines of `ZodEffects` unwrapping."
3. **No `fieldConfig` / `inputProps` overrides bag** as a Field prop. Every field accepts explicit, typed props.
4. **No auto-derived labels.** `label` is always required, always explicit, always passed by the form author.
5. **No `useFormContext()` calls inside entity forms.** The Field primitives already consume context. Form authors compose Field primitives; they never reach for raw RHF state.
6. **No raw `<input>`, no direct Base UI primitives, no manual `<FormField control={...} render={...} />` boilerplate inside an entity form.** Always go through the Field layer.
7. **No schemas defined inside component files.** Schemas live in `src/entities/<name>/schema.ts`. Components import them.
8. **No `as any` on field `name` props.** If TypeScript complains, the form and the schema are out of sync — fix the schema, never the cast.
9. **No skipping `useDrfErrors` in mutation `onError`.** Every form mutation routes backend errors through the hook.
10. **No API code in entity form files.** No `axios`, no `useMutation` written by hand inside an entity form. All network surface comes from `@/sdk/resources/<resource>` — either as imperative `sdk.<resource>.<action>()` calls or as `use<Resource><Action>()` hooks.
11. **No `api.ts`, `keys.ts`, or `mutations.ts` inside `src/entities/<name>/`.** That folder is forms, schemas, display components, and business-rule hooks. The API surface belongs to the SDK.
12. **No new form-authoring abstraction without two real consumers.** If you find yourself extracting a "shared form helper" because you've written it once, stop. Wait for the second instance. Most "shared form helpers" become the next AutoForm.
13. **No `getDefaults(schema)` runtime helpers.** Each entity exports its own typed `<entity>Defaults`.
14. **No mixing of form Zod schemas and SDK types.** A form Zod schema is a UX contract; an SDK type is a wire contract. They are kept in sync by the compile-time `assertSchemaMatchesSdk` assertion, not by making one import the other's runtime artifacts.
15. **No `useForm` without `resolver: zodResolver(...)`.** A form without a Zod schema has no validation contract and no inferred input type.

---

## 15. Foundation deliverables (this phase only)

The agent ships the following before any entity form is written. Everything here must be reviewed and approved before phase 2 (per-entity form components) begins.

### 15.1 Field library

All 14 atomic fields (§7.1) and all 8 compositional pieces (§7.2), fully typed, keyboard-accessible, with focus rings honoring the design brief's `--ring` token. Every field passes WCAG AA contrast on the cream surfaces.

### 15.2 Forms-layer libraries

- `src/lib/forms/use-drf-errors.ts` — SDK `ApiError` → RHF mapping, with optional stepper integration.
- `src/lib/forms/use-zod-field-meta.ts` — derives `required` / `optional` / `min` / `max` from a Zod schema slice for a given field path.
- `src/lib/forms/assert-schema-matches-sdk.ts` — the compile-time drift guard type util.
- `src/lib/zod-i18n.ts` — bilingual Zod custom error map (English-only in foundation; Burmese in a later phase).

### 15.3 Showcase

A `/_design/forms` route (companion to the four pages in design brief §13.4) that renders:

1. Every atomic field in its default, filled, error, disabled, and loading-skeleton states.
2. A `<FieldGroup>` example with two date fields side by side.
3. A `<FormStepper>` example with three steps.
4. A bilingual stress-test form: English labels + Burmese field values + a Burmese error message + a Burmese name in a `<TextField>` + a Burmese description on a `<SelectField>`.

If any of these renders incorrectly — broken validation, broken layout when error appears, broken Burmese rendering — the foundation is not done.

### 15.4 Reference entity form

One end-to-end reference implementation: `src/entities/course/forms/course-create-form.tsx`, composed using the new fields, validated against `courseCreateSchema` in `src/entities/course/schema.ts`, submitting through `sdk.courses.create` / `useCreateCourse`. This is the worked example the rest of phase 2 follows.

---

## 16. Known open follow-ups (named, deferred)

- **Bilingual Zod error map (Burmese strings)** — stub English-only in foundation; full Burmese translations come with the i18n pass.
- **`EntityComboboxField` and the rest of §7.3** — the schedjuice-specific composites are layered on after foundation, all following the conventions in §8.
- **Server-side-only validation rules** (e.g. "course code must be unique") render as DRF errors through `useDrfErrors`. No client-side mirroring — the round-trip is the contract.
- **Optimistic updates** — owned by the SDK's per-resource hooks, not by the form. The form's job ends at calling `mutate()`.
- **Form auto-save** — out of scope. If a future feature needs it, it adds a new compositional primitive (e.g. `<FormAutoSave debounceMs={...} />`) rather than baking save semantics into `<FormProvider>`.

---

## 17. How "done" is judged

The forms foundation is **complete** when:

- Every Field primitive in §7 is implemented, typed, keyboard-accessible, and renders correctly in default, filled, error, disabled, and loading-skeleton states.
- The `/_design/forms` showcase renders without bug.
- The bilingual stress-test form shows no broken rendering.
- The reference `CourseCreateForm` is implemented, validates against `courseCreateSchema`, submits through `sdk.courses.create`, surfaces DRF errors via `useDrfErrors`, and can be reviewed by a maintainer in a single top-to-bottom read.
- A maintainer can put the new `CourseCreateForm` next to the legacy `src/components/course/course-create-form.tsx` (788 lines, six inline lambdas) and immediately answer: "Yes, this is the same form, and yes, the new one is the one I want to maintain."

If the maintainer hesitates on that comparison, the forms layer has drifted toward the abstraction the brief is trying to escape, and it needs another pass. The clarity of a hand-composed entity form is the deliverable.

---

## 18. Verification checklist (do this first, before writing any forms code)

This brief was written assuming the design system brief and the API SDK brief were implemented exactly as specified. **Before you write a single Field primitive, verify the three contracts below against the actual code.** If any has drifted, **stop and flag it back to the user** — do not silently adapt the forms layer to drifted upstream code, because the rest of the brief depends on these contracts holding.

### 18.1 Design system primitives

Open `src/components/primitives/` (or wherever §13.2 primitives landed) and verify:

- [ ] Item 4 of design brief §13.2 is named `NumberInput`, **not** `NumberField`. The forms layer reuses the name `NumberField` for its form-aware field; the two cannot coexist. If the primitive is still `NumberField`, one of the two must be renamed before forms work starts.
- [ ] The `Field` composition primitive (§13.2 item 19) exposes `Field.Root`, `Field.Label`, `Field.Control`, `Field.Description`, `Field.Error` — i.e., the Base UI `Field.*` surface. If the design agent built a custom composition (e.g., `FormItem` / `FormControl`) instead, the §7 internal-structure diagram and every Field implementation needs to adapt.
- [ ] Every §13.2 input primitive (`Input`, `Textarea`, `NumberInput`, `Select`, `Combobox`, `Checkbox`, `RadioGroup`, `Switch`, `Slider`) accepts a `render`-prop / `asChild`-style API or a flat ref + native props API. The forms layer wraps each in `Field.Control render={...}`; if the primitive doesn't accept the render shape, the wrapper changes.

### 18.2 SDK surface

Open `src/sdk/` and verify:

- [ ] Per-resource hooks exist with the shape `use<Resource><Action>(options)` returning `{ mutate, isPending, ... }` for mutations and `{ data, isLoading, ... }` for queries — e.g., `useCreateCourse`, `useUpdateCourse`, `useCoursesList`. If the SDK agent named them differently (e.g., `useCourse.create()` namespace pattern), §13's example import in this brief is wrong and the entity forms need to follow whatever pattern the SDK actually shipped.
- [ ] `ApiError` (or whatever the SDK calls it) is a typed error class with at least `details: Record<string, string | string[]>` containing per-field errors, plus a path for `non_field_errors` / `detail` (root errors). `useDrfErrors` in §12 of this brief walks exactly this shape. If the SDK normalized errors differently, `useDrfErrors` is rewritten to match.
- [ ] The SDK exports per-resource types from `src/sdk/_types/<resource>.ts` (or equivalent), including `<Resource>CreateBody` and `<Resource>UpdateBody`. The `assertSchemaMatchesSdk` drift guard in §9 imports these. If types live elsewhere, update the import path convention.

### 18.3 Entity folder boundary

Open `src/entities/` (if it exists) and verify:

- [ ] **No `api.ts`, `keys.ts`, or `mutations.ts` exists inside any `src/entities/<name>/`.** If the SDK agent (or earlier scaffolding) created any, they need to be moved into `src/sdk/resources/<name>` before forms work begins. The forms brief depends on the entity folder being forms-only (schema + forms + components + business-rule hooks). API surface belonging to entities is the failure mode the SDK brief explicitly fixed.

### 18.4 What "flag back" means

If any checkbox above is unchecked, do not proceed. Write a single message to the user with:

1. Which contract drifted.
2. What the actual code does instead.
3. Two options: (a) adjust the brief to match the impl, (b) adjust the impl to match the brief. Recommend one.

Wait for direction. The forms layer is the third leg of the foundation phase — getting it on a wobbly stand makes the whole stool unstable.
