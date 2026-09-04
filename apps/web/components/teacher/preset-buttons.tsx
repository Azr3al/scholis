'use client';

import { Button } from '@/components/ui/button';

export const PresetButtons = ({
  presets,
  value,
  onSelect,
  formatLabel,
}: {
  presets: readonly number[];
  value: string;
  onSelect: (next: string) => void;
  formatLabel: (preset: number) => string;
}) => (
  <div className="flex flex-wrap gap-2">
    {presets.map((preset) => {
      const active = value === String(preset);
      return (
        <Button
          key={preset}
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={active}
          className={active ? 'border-primary bg-muted' : undefined}
          onClick={() => {
            onSelect(String(preset));
          }}
        >
          {formatLabel(preset)}
        </Button>
      );
    })}
  </div>
);
