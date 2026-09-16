"use client";
import { Button, Dialog, Input, Switch, buttonVariants, inputClassName } from "@/components/primitives";

import { useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: {
    title: string;
    is_named_test: boolean;
    max_marks: number | null;
  }) => void;
  isPending?: boolean;
};

export function AddResultColumnDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: Props) {
  const [title, setTitle] = useState("");
  const [isNamedTest, setIsNamedTest] = useState(true);
  const [maxMarks, setMaxMarks] = useState("58");

  const handleSubmit = () => {
    onSubmit({
      title: title.trim(),
      is_named_test: isNamedTest,
      max_marks: isNamedTest ? Number(maxMarks) : null,
    });
    setTitle("");
    setMaxMarks("58");
    setIsNamedTest(true);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
        <div>
          <Dialog.Title>Add column</Dialog.Title>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="col-title">Title</label>
            <Input
              id="col-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Reading"
            />
          </div>
          <div className="flex items-center justify-between">
            <label htmlFor="named-test">Named test</label>
            <Switch
              id="named-test"
              checked={isNamedTest}
              onCheckedChange={setIsNamedTest}
            />
          </div>
          {isNamedTest ? (
            <div className="space-y-2">
              <label htmlFor="max-marks">Max marks</label>
              <Input
                id="max-marks"
                type="number"
                min={1}
                value={maxMarks}
                onChange={(e) => setMaxMarks(e.target.value)}
              />
            </div>
          ) : null}
        </div>
        <div>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || (isNamedTest && !maxMarks)}
            isLoading={isPending}
          >
            Add column
          </Button>
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
