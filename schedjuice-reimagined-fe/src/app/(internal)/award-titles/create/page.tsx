"use client";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
import BackButton from "@/components/misc/back-button";
import { Button, Field, Input, Select, useToast } from "@/components/primitives";
import { createAwardTitle } from "@/lib/awards-api";
import type { AwardFamily } from "@/types/award";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

const FAMILY_ITEMS = [
  { value: "none", label: "None" },
  { value: "academic_excellence", label: "Academic excellence" },
  { value: "attendance", label: "Attendance" },
] as const;

const AwardTitleCreatePage: React.FC = () => {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [family, setFamily] = useState("none");

  const save = useMutation({
    mutationFn: () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      return createAwardTitle({
        name: trimmed,
        family: family === "none" ? null : (family as AwardFamily),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["award-titles"] });
      toast.add({ title: "Award title created." });
      router.push("/award-titles");
    },
    onError: () => {
      toast.add({ type: "error", title: "Could not create award title." });
    },
  });

  return (
    <PageContainer width="narrow">
      <div data-slot="page-section-quiet">
        <BackButton href="/award-titles" />
      </div>
      <PageHeader
        title="Create award title"
        description="Pinned onto every course picker. Teachers can still add one-off local titles on a course."
      />
      <PageSection>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <Field.Root>
            <Field.Label>Name</Field.Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>Family</Field.Label>
            <Select
              value={family}
              onValueChange={setFamily}
              items={[...FAMILY_ITEMS]}
            />
            <Field.Description>
              Optional. Students may only hold one title from a family per period.
            </Field.Description>
          </Field.Root>
          <Button type="submit" isLoading={save.isLoading} disabled={!name.trim()}>
            Create
          </Button>
        </form>
      </PageSection>
    </PageContainer>
  );
};

export default AwardTitleCreatePage;
