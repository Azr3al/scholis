'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface FieldErrors {
  code?: string;
  name?: string;
}

export default function EnterCodePage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const clearCodeError = () => {
    if (fieldErrors.code !== undefined) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next.code;
        return next;
      });
    }
  };

  const clearNameError = () => {
    if (fieldErrors.name !== undefined) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next.name;
        return next;
      });
    }
  };

  const join = () => {
    const errors: FieldErrors = {};
    if (code.trim() === '') errors.code = 'Enter the test code your teacher gave you.';
    if (name.trim() === '') errors.name = 'Enter your name.';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const params = new URLSearchParams({ name: name.trim() });
    router.push(`/take/${encodeURIComponent(code.trim())}?${params.toString()}`);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Join a test</CardTitle>
          <CardDescription>Enter the code your teacher gave you.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              join();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="code">Test code</Label>
              <Input
                id="code"
                value={code}
                aria-invalid={fieldErrors.code !== undefined}
                onChange={(e) => {
                  setCode(e.target.value);
                  clearCodeError();
                }}
                placeholder="SCHOL-4F2K"
                autoCapitalize="characters"
                data-testid="code-input"
              />
              {fieldErrors.code !== undefined && (
                <p className="text-sm text-destructive">{fieldErrors.code}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                value={name}
                aria-invalid={fieldErrors.name !== undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  clearNameError();
                }}
                placeholder="Ada Lovelace"
                data-testid="name-input"
              />
              {fieldErrors.name !== undefined && (
                <p className="text-sm text-destructive">{fieldErrors.name}</p>
              )}
            </div>
            <Button type="submit" data-testid="join">
              Start
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
