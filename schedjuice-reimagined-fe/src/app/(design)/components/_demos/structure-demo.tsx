// src/app/(design)/components/_demos/structure-demo.tsx
"use client";

import { Avatar, Separator, Tabs } from "@/components/primitives";
import { RoughDivider } from "@/components/primitives/decoration/rough-divider";

const roster = [
  { name: "သီရိ ကျော်", course: "English — L3", paid: "123,450" },
  { name: "Min Thant", course: "Physics — Foundation", paid: "98,000" },
  { name: "ဇေယျာ နိုင်", course: "သင်္ချာ — Grade 9", paid: "150,000" },
];

export function StructureDemo() {
  return (
    <section className="space-y-8">
      <h2 className="font-serif text-2xl">Structure</h2>

      <div>
        <Tabs.Root defaultValue="overview" className="max-w-md">
          <Tabs.List>
            <Tabs.Tab value="overview">Overview</Tabs.Tab>
            <Tabs.Tab value="roster">Roster</Tabs.Tab>
            <Tabs.Tab value="finance">Finance</Tabs.Tab>
            <Tabs.Indicator />
          </Tabs.List>
          <Tabs.Panel value="overview">Workspace stats and activity.</Tabs.Panel>
          <Tabs.Panel value="roster">Members and attendance.</Tabs.Panel>
          <Tabs.Panel value="finance">Invoices and payments.</Tabs.Panel>
        </Tabs.Root>
      </div>

      <div className="flex items-center gap-3">
        <Avatar name="Thiri Kyaw" />
        <Avatar name="သီရိ ကျော်" />
        <Separator orientation="vertical" className="h-8" />
        <span className="text-text-secondary">Avatars fall back to initials.</span>
      </div>

      <RoughDivider />

      {/* §9: typography-first table — small-caps Latin headers, 52px rows, tabular numbers */}
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border-strong">
            <th className="pb-2 text-xs font-semibold tracking-wider text-text-muted uppercase">Student</th>
            <th className="pb-2 text-xs font-semibold tracking-wider text-text-muted uppercase">Course</th>
            <th className="pb-2 text-right text-xs font-semibold tracking-wider text-text-muted uppercase">
              Paid (MMK)
            </th>
          </tr>
        </thead>
        <tbody>
          {roster.map((r) => (
            <tr key={r.name} className="h-[52px] border-b border-border">
              <td>{r.name}</td>
              <td className="text-text-secondary">{r.course}</td>
              <td className="text-right font-mono tabular-nums">{r.paid}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
