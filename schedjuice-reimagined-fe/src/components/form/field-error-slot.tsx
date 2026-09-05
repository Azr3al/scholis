import { Field } from "@/components/primitives";

export function FormFieldErrorSlot({ message }: { message?: string }) {
  return (
    <div className="min-h-5">
      {message ? <Field.Error role="alert">{message}</Field.Error> : null}
    </div>
  );
}
