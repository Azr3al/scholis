"use client";
import { Button, Input, Skeleton, buttonVariants, inputClassName, useToast } from "@/components/primitives";

import { Copy } from "iconoir-react";

import { ClipboardCheck as CopyCheck } from "iconoir-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
interface CopyInputProps {
  text: string;
  label: string;
  description?: string;
  className?: string;
  labelClassName?: string;
  isLoading?: boolean;
  disabled?: boolean
}

const CopyInput: React.FC<CopyInputProps> = ({
  text,
  label,
  description,
  className,
  labelClassName,
  isLoading,
  disabled
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const toast = useToast();
  return (
    <div className={cn("space-y-2", className)}>
      <label className={cn("font-bold", labelClassName)}>{label}</label>
      {isLoading ? (
        <div>
          <Skeleton className="w-full h-10"></Skeleton>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="w-full">
            <Input
              className="h-10"
              disabled={disabled}
              readOnly
              value={text}
            />
          </div>
          <Button
          className="p-1"
            size="sm"
            variant={"ghost"}
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(text);
              setIsCopied(true);
              setTimeout(() => setIsCopied(false), 1000);
              toast.add({ description: "Copied to clipboard" });
            }}
          >
            {isCopied ? <CopyCheck></CopyCheck> : <Copy></Copy>}
          </Button>
        </div>
      )}
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
};

export default CopyInput;
