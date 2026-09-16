import { Button, Input, buttonVariants, inputClassName, useToast } from "@/components/primitives";
import { useMutation } from "@tanstack/react-query";
import { EditPencil as Edit } from "iconoir-react";
import { useEffect, useState } from "react";
import { updateEntity } from "@/app/client-api/utils";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/query";
import { userPaymentsKeys } from "@/sdk/keys/user-payments";

type InlineInputSelfContainedProps = {
  value: string;
  fieldName: string;
  entityName: string;
  entityId: number | string;
  uid?: string;
  inputType?: "string" | "number";
  isDisabled?: boolean;
  inputClassName?: string;
  displayFunc?: (value: string) => React.ReactNode;
  /** When provided, called instead of the default PUT to `entityName/entityId`. */
  onSave?: (value: string) => Promise<any>;

  onChange?: never;
  isInlineEditing?: never;
};

type InlineInputControlledProps = {
  value: string;
  onChange: (value: string) => void;
  isInlineEditing: boolean;
  inputType?: "string" | "number";
  isDisabled?: boolean;
  inputClassName?: string;
  displayFunc?: (value: string) => React.ReactNode;
  fieldName?: never;
  entityName?: never;
  entityId?: never;
  uid?: never;
};

type InlineInputProps = InlineInputSelfContainedProps | InlineInputControlledProps;

const InlineInput: React.FC<InlineInputProps> = (props) => {
  const {
    value,
    inputType = "string",
    isDisabled = false,
    inputClassName,
    displayFunc,
  } = props;

  const isControlled = typeof (props as any).onChange === "function";
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const toast = useToast();

  const effectiveValue = isControlled ? value : inputValue;

  useEffect(() => {
    if (!isControlled) {
      setInputValue(value);
    }
  }, [value, isControlled]);

  const shouldShowInlineInput = isControlled
    ? (props as InlineInputControlledProps).isInlineEditing
    : showInput;

  const updateMutation = useMutation({
    mutationKey: isControlled
      ? ["inlineInputUpdate", "controlled"]
      : [
          "inlineInputUpdate",
          (props as InlineInputSelfContainedProps).entityName,
          (props as InlineInputSelfContainedProps).entityId,
          (props as InlineInputSelfContainedProps).fieldName,
        ],
    mutationFn: async (data: any) => {
      if (isControlled) return;
      const p = props as InlineInputSelfContainedProps;
      if (p.onSave) return p.onSave(data);
      return updateEntity(p.entityName, p.entityId, {
        [p.fieldName]: data,
      });
    },
    onSuccess: () => {
      if (isControlled) return;
      const { entityName, uid } = props as InlineInputSelfContainedProps;
      toast.add({ description: "Saved successfully" });
      setShowInput(false);
      if (uid) {
        queryClient.refetchQueries({ queryKey: [`search${entityName}`, uid] });
      } else {
        queryClient.refetchQueries({
          queryKey: [`search${entityName}`],
        });
      }
      if (entityName === "user-payments") {
        void queryClient.invalidateQueries({
          queryKey: userPaymentsKeys.all,
        });
      }
    },
  });

  const cancelEditing = () => {
    setShowInput(false);
    setInputValue(value);
  };

  return (
    <div
      className={cn(
        "group flex items-center",
        shouldShowInlineInput
          ? "w-full flex-col items-stretch gap-2"
          : "justify-between",
      )}
    >
      {shouldShowInlineInput ? (
        <div className="min-w-0 w-full">
          <Input
            type={inputType}
            value={effectiveValue}
            className={inputClassName}
            onChange={(e) => {
              const next = e.target.value;
              if (isControlled) {
                (props as InlineInputControlledProps).onChange(next);
              } else {
                setInputValue(next);
              }
            }}
            onKeyDown={(e) => {
              if (isControlled) return;
              if (e.key === "Enter") {
                e.preventDefault();
                updateMutation.mutate(inputValue);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancelEditing();
              }
            }}
          />
        </div>
      ) : (
        <p>{displayFunc ? displayFunc(effectiveValue) : effectiveValue}</p>
      )}

      {!isControlled && showInput && (
        <div className="flex w-full shrink-0 flex-wrap gap-2">
          <Button
            isLoading={updateMutation.isPending}
            onClick={() => updateMutation.mutate(inputValue)}
            size={"sm"}
          >
            Save
          </Button>
          <Button
            isLoading={updateMutation.isPending}
            onClick={cancelEditing}
            size={"sm"}
            variant="secondary"
          >
            Cancel
          </Button>
        </div>
      )}

      {!isDisabled && !isControlled && !showInput && (
        <Edit
          onClick={() => setShowInput(true)}
          className="ml-2 w-0 opacity-0 h-0 group-hover:h-auto group-hover:w-auto group-hover:opacity-100 cursor-pointer"
          width={20}
          height={20}
          role="button"
        />
      )}
    </div>
  );
};

export default InlineInput;
