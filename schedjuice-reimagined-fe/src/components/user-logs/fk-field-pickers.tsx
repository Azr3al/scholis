"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { Select } from "@/components/primitives";

export function StaffUserPicker({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  disabled?: boolean;
}) {
  const { data } = useQuery({
    queryKey: ["userlog-staff-users"],
    queryFn: async () => {
      const res = await searchEntities(
        "users",
        { size: 500, fields: ["id", "name", "roles"] },
        { filter_params: [] },
      );
      const rows = (res.data.data ?? []) as Array<{
        id: number;
        name: string;
        roles: string[];
      }>;
      return rows.filter((u) => (u.roles ?? []).some((r) => r !== "student"));
    },
  });

  return (
    <Select
      value={value ? String(value) : ""}
      onValueChange={(v) => onChange(v ? Number(v) : null)}
      disabled={disabled}
      items={(data ?? []).map((u) => ({
        value: String(u.id),
        label: u.name,
      }))}
      placeholder="Select staff member"
    />
  );
}

export function CoursePicker({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  disabled?: boolean;
}) {
  const { data } = useQuery({
    queryKey: ["userlog-courses"],
    queryFn: async () => {
      const res = await searchEntities(
        "courses",
        { size: 500, fields: ["id", "title"] },
        { filter_params: [] },
      );
      return (res.data.data ?? []) as Array<{ id: number; title: string }>;
    },
  });

  return (
    <Select
      value={value ? String(value) : ""}
      onValueChange={(v) => onChange(v ? Number(v) : null)}
      disabled={disabled}
      items={(data ?? []).map((c) => ({
        value: String(c.id),
        label: c.title,
      }))}
      placeholder="Select course"
    />
  );
}
