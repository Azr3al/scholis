// src/app/(design)/components/_demos/inputs-demo.tsx
"use client";

import {
  Button,
  Checkbox,
  Combobox,
  Field,
  Input,
  NumberField,
  Radio,
  RadioGroup,
  Select,
  Slider,
  Switch,
  Textarea,
} from "@/components/primitives";

const courses = [
  { label: "အင်္ဂလိပ်စာ — Level 3", value: "eng-3" },
  { label: "သင်္ချာ — Grade 9", value: "math-9" },
  { label: "Physics — Foundation", value: "phys-0" },
];

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 border-b border-border py-5 sm:grid-cols-[12rem_1fr]">
      <h3 className="font-mono text-mono-sm text-text-muted">{title}</h3>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export function InputsDemo() {
  return (
    <section>
      <h2 className="mb-2 font-serif text-2xl">Inputs</h2>
      <Row title="Button">
        <Button>Save changes</Button>
        <Button variant="secondary">Cancel</Button>
        <Button variant="ghost">Skip</Button>
        <Button variant="danger">Delete</Button>
        <Button disabled>Disabled</Button>
        <Button isLoading>Saving…</Button>
      </Row>
      <Row title="Field + Input">
        <Field.Root className="w-64">
          <Field.Label>ကျောင်းသားအမည် (Student name)</Field.Label>
          <Field.Control placeholder="အမည် / Name" required />
          <Field.Description>Shown on the roster.</Field.Description>
          <Field.Error match="valueMissing">Please enter a name.</Field.Error>
        </Field.Root>
      </Row>
      <Row title="Textarea">
        <Textarea className="max-w-sm" placeholder="Notes…" />
      </Row>
      <Row title="Checkbox / Radio / Switch">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox defaultChecked /> Send receipt
        </label>
        <RadioGroup defaultValue="teacher" className="flex-row gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Radio value="teacher" /> Teacher
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Radio value="student" /> Student
          </label>
        </RadioGroup>
        <label className="flex items-center gap-2 text-sm">
          <Switch defaultChecked /> Notifications
        </label>
      </Row>
      <Row title="Slider / NumberField">
        <Slider defaultValue={40} className="max-w-xs" />
        <NumberField defaultValue={12} />
      </Row>
      <Row title="Select / Combobox">
        <Select items={courses} placeholder="Pick a course" />
        <Combobox items={courses} placeholder="Search courses…" />
      </Row>
    </section>
  );
}
