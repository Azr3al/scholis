"use client";
import { Switch, Field } from "@/components/primitives";

import { cn } from "@/lib/utils";
import { Controller } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";

type PublicProfileSettingsCardProps = {
  form: UseFormReturn<any>;
  isSubmitting: boolean;
  enabled: boolean;
};

export function PublicProfileSettingsCard({
  form,
  isSubmitting,
  enabled,
}: PublicProfileSettingsCardProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-elevated">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-medium text-text-primary">Visibility</p>
        <p className="text-sm text-text-muted">
          Control what visitors see on your public profile.
        </p>
      </div>
      <div className="divide-y divide-border">
        <Controller
          control={form.control}
          name="is_public_profile_enabled"
          render={({ field, fieldState }) => (
            <Field.Root className="flex flex-row items-center justify-between gap-4 px-4 py-3" name={field.name} invalid={Boolean(fieldState.error)}>
              <div className="space-y-0.5">
                <Field.Label>Enable public profile</Field.Label>
                <Field.Description>
                  Anyone with the link can view your name, photo, qualifications, and
                  certifications without signing in.
                </Field.Description>
              </div>
<Switch
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                  disabled={isSubmitting}
                />
</Field.Root>
          )}
        />
        <Controller
          control={form.control}
          name="show_certifications_on_public_profile"
          render={({ field, fieldState }) => (
            <Field.Root className={cn(
                "flex flex-row items-center justify-between gap-4 px-4 py-3 transition-opacity",
                !enabled && "pointer-events-none opacity-50",
              )} name={field.name} invalid={Boolean(fieldState.error)}>
              <div className="space-y-0.5">
                <Field.Label>Show certifications on public profile</Field.Label>
                <Field.Description>
                  When enabled, your certification list appears on your public profile page.
                </Field.Description>
              </div>
<Switch
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                  disabled={isSubmitting || !enabled}
                />
</Field.Root>
          )}
        />
      </div>
    </div>
  );
}
