'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  buildAllOrNothingRubric,
  buildEvenSplitRubric,
  type ChoiceRubricTier,
} from '@scholis/schema';

export const ChoiceRubricEditor = ({
  rubric,
  maxPoints,
  onChange,
  disabled,
}: {
  rubric: ChoiceRubricTier[];
  maxPoints: number;
  onChange: (next: ChoiceRubricTier[]) => void;
  disabled?: boolean;
}) => {
  const correctCount = rubric.length - 1;

  const updateTier = (index: number, points: number) => {
    onChange(
      rubric.map((tier, tierIndex) =>
        tierIndex === index ? { ...tier, points } : tier,
      ),
    );
  };

  return (
    <div className="grid gap-3 rounded-lg border p-3" data-testid="choice-rubric">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-sm font-medium">Scoring rubric</Label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            data-testid="rubric-preset-even"
            onClick={() => {
              onChange(buildEvenSplitRubric(correctCount, maxPoints));
            }}
          >
            Even split
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            data-testid="rubric-preset-all-or-nothing"
            onClick={() => {
              onChange(buildAllOrNothingRubric(correctCount, maxPoints));
            }}
          >
            All or nothing
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Marks awarded by how many correct options the student selects. Wrong selections are
        ignored.
      </p>

      <ul className="flex flex-col gap-2">
        {rubric.map((tier, index) => (
          <li
            key={tier.correctCount}
            className="flex items-center justify-between gap-3"
            data-testid={`rubric-tier-${String(tier.correctCount)}`}
          >
            <span className="text-sm">
              {tier.correctCount === correctCount
                ? `${String(tier.correctCount)} correct (full marks)`
                : `${String(tier.correctCount)} correct`}
            </span>
            <Input
              type="number"
              min={0}
              max={maxPoints}
              step={0.01}
              className="h-8 w-24"
              disabled={disabled}
              value={tier.points}
              data-testid={`rubric-points-${String(tier.correctCount)}`}
              onChange={(e) => {
                updateTier(index, Number(e.target.value));
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
};
