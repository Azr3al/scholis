# Table Column Sizing Contract

`ResourceTable` columns declare semantic sizing through `Column.sizing`. Route
code supplies content intent; the shared table stack owns width, wrapping,
alignment, and overflow behavior.

## Roles

| Role | Minimum | Preferred | Maximum | Wrap | Alignment | Tabular |
| --- | --- | --- | --- | --- | --- | --- |
| `identifier` | `8rem` | `10rem` | `14rem` | truncate | left | no |
| `person` | `12rem` | `14rem` | `18rem` | wrap | left | no |
| `prose` | `14rem` | `20rem` | `28rem` | wrap | left | no |
| `date` | `9rem` | `11rem` | `14rem` | nowrap | left | no |
| `numeric` | `7rem` | `9rem` | `12rem` | nowrap | right | yes |
| `status` | `9rem` | `11rem` | `14rem` | nowrap | left | no |
| `action` | `5rem` | `6rem` | `8rem` | nowrap | center | no |
| `control` | `10rem` | `12rem` | none | nowrap | left | no |

## Declaration

Use a builder role when a shared default fits:

```typescript
column.text<Person>({
  id: "name",
  header: "Name",
  accessor: (row) => row.name,
  sizing: { role: "person" },
});
```

Use an explicit override only when observed content requires it:

```typescript
column.text<Campus>({
  id: "description",
  header: "Description",
  accessor: (row) => row.description,
  sizing: {
    role: "prose",
    width: { min: "16rem", preferred: "22rem", max: "30rem" },
    wrap: "wrap",
  },
});
```

Explicit `width`, `wrap`, `align`, and `tabular` values override role defaults.
Unspecified values continue to come from the role.

## Rendering rules

1. `useTableInstance` resolves semantic metadata once and passes it through
   TanStack column meta.
2. `Table` renders a `<colgroup>` with minimum, preferred, and optional maximum
   widths.
3. The table scroll container must overflow horizontally before any column
   shrinks below its minimum.
4. Numeric columns use right alignment and `tabular-nums`.
5. Person and prose columns may wrap; status, date, action, and control columns
   remain on one line.
6. Editable controls reserve at least `10rem` for the editor and feedback.
7. Table rows retain the DESIGN.md minimum height of `52px`.

## Consumer restrictions

Route cohorts must not add local `min-w-*`, `max-w-*`, wrapping, or alignment
classes to table cells when `Column.sizing` can express the requirement.
Escalate a missing semantic role or shared default to the R3 owner.

Glide remains a separate spreadsheet interaction class. This contract applies
to `Table` and `ResourceTable`; it does not change Glide sizing behavior.
