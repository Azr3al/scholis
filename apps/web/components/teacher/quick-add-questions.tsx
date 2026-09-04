'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { useId, useState } from 'react';

type QuickAddKind = 'single' | 'multi' | 'short' | 'essay';

const KINDS: { value: QuickAddKind; label: string }[] = [
  { value: 'single', label: 'Single choice' },
  { value: 'multi', label: 'Multiple choice' },
  { value: 'short', label: 'Short answer' },
  { value: 'essay', label: 'Essay' },
];

const kindLabel = (value: QuickAddKind): string =>
  KINDS.find((k) => k.value === value)?.label ?? value;

export const QuickAddQuestions = ({
  testId,
  onAdded,
  layout = 'default',
}: {
  testId: string;
  onAdded: () => void;
  layout?: 'default' | 'sidebar';
}) => {
  const groupName = useId();
  const [kind, setKind] = useState<QuickAddKind>('single');
  const [count, setCount] = useState('1');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const parsed = Number(count);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
      setError('Enter a number between 1 and 20.');
      return;
    }

    setAdding(true);
    setError(null);
    void api
      .addDraftQuestions({
        testId,
        kind,
        count: parsed,
      })
      .then(() => {
        setCount('1');
        onAdded();
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not add those questions.');
      })
      .finally(() => {
        setAdding(false);
      });
  };

  const form = (
    <form
      className="flex flex-col gap-3"
      aria-busy={adding}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      {layout === 'sidebar' ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor={`${groupName}-kind`}>Type</Label>
            <Select
              value={kind}
              onValueChange={(value) => {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Select only emits defined kind values
                setKind(value!);
                setError(null);
              }}
            >
              <SelectTrigger
                id={`${groupName}-kind`}
                className="w-full"
                data-testid="quick-add-kind"
              >
                <SelectValue>{(value) => kindLabel(value as QuickAddKind)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${groupName}-count`}>Count</Label>
            <Input
              id={`${groupName}-count`}
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => {
                setCount(e.target.value);
                setError(null);
              }}
              className="w-full"
              data-testid="quick-add-count"
            />
          </div>

          <Button type="submit" disabled={adding} className="w-full" data-testid="quick-add-submit">
            {adding ? 'Adding…' : 'Add questions'}
          </Button>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="grid gap-2">
              <Label htmlFor={`${groupName}-kind`}>Type</Label>
              <Select
                value={kind}
                onValueChange={(value) => {
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Select only emits defined kind values
                  setKind(value!);
                  setError(null);
                }}
              >
                <SelectTrigger
                  id={`${groupName}-kind`}
                  className="w-full"
                  data-testid="quick-add-kind"
                >
                  <SelectValue>{(value) => kindLabel(value as QuickAddKind)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`${groupName}-count`}>Count</Label>
              <Input
                id={`${groupName}-count`}
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => {
                  setCount(e.target.value);
                  setError(null);
                }}
                className="w-full sm:w-24"
                data-testid="quick-add-count"
              />
            </div>

            <Button type="submit" disabled={adding} data-testid="quick-add-submit">
              {adding ? 'Adding…' : 'Add questions'}
            </Button>
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Empty placeholders are added to the list. Open each one to fill it in before publishing.
      </p>

      {error !== null && (
        <p className="text-sm text-destructive" data-testid="quick-add-error">
          {error}
        </p>
      )}
    </form>
  );

  if (layout === 'sidebar') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Add questions</p>
        {form}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add questions</CardTitle>
      </CardHeader>
      <CardContent>{form}</CardContent>
    </Card>
  );
};
