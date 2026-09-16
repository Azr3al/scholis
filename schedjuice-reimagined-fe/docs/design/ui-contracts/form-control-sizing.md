# Form and Control Sizing Contract

Form fields use `FieldMeasure` for available line length. Individual controls
use `ControlSize` for trigger height and width behavior. These concepts are
independent: a full-width control fills its current field measure.

## FieldMeasure

| Measure | Class | Use |
| --- | --- | --- |
| `narrow` | `w-full max-w-md` | Create wizards and compact settings |
| `default` | `w-full max-w-xl` | Standard create and edit forms |
| `wide` | `w-full max-w-2xl` | Rich text and multi-control groups |
| `full` | `w-full max-w-none` | Dense operational panels and toolbars |

AutoForm resolves measure in this order:

1. `fieldConfigItem.measure`
2. `AutoFormGroup.measure`
3. `AutoForm.measure`
4. `default`

Consumers select a measure at the form or group boundary. Controls must not
add unrelated `max-w-*` classes.

## ControlSize

| Size | Height | Width behavior |
| --- | --- | --- |
| `compact` | `h-8` | `min-w-0 w-auto`; opt-in for table cells |
| `default` | `h-10` | `min-w-44 w-auto`; standalone trigger |
| `full` | `h-10` | `min-w-0 w-full max-w-full`; fills field measure |

`Select`, `Selector`, and `Combobox` use this terminology. New boolean width
props are prohibited. The deprecated `Select.fullWidth` adapter exists only
for staged consumer migration and maps to `size="full"`.

## DatePicker

Import from `@/components/date/date-picker`.

```tsx
<DatePicker
  variant="popover"
  size="full"
  date={selectedDate}
  setDate={setSelectedDate}
/>
```

Use `variant="native"` when a native date input is required. The
`@/components/users/date-picker` module is a compatibility re-export and must
not contain an independent implementation.

## Reserved feedback space

Every field reserves `min-h-5` for validation errors. Edit AutoForm reserves
its existing save-status row before status text appears. Async controls reserve
their trigger dimensions during loading. Loading, validation, saving, and saved
states must not change surrounding layout.

## Stable component identity

`AutoFormField` remains a module-level memoized component. It subscribes to one
field through `Controller` and `useFormState({ control, name })`. Do not define
field component types inside render functions and do not call whole-form
`watch()` from the AutoForm root. Typing in one field must not remount or
unfocus another field.

## Compact usage restrictions

Compact controls are opt-in for toolbars and table cells. Standard form fields
use `default` or `full`. Route code must not recreate these modes with local
height or width utility combinations.
