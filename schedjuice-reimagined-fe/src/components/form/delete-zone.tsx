import { Button, Input, buttonVariants, inputClassName, useToast } from "@/components/primitives";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { useRouter } from "next/navigation";
import { deleteEntity, fetchEntity } from "@/app/client-api/utils";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";

interface IDeleteZoneProps {
  validate_input?: string;
  entityName: string;
  entityId: string | number;
  label?: string;
  description?: string;
  deleteApiUrl: string;
  redirectUrl?: string;
  validateInputKey?: string;
}

const DeleteZone: React.FC<IDeleteZoneProps> = ({
  validate_input,
  entityName,
  label,
  description,
  entityId,
  deleteApiUrl,
  redirectUrl,
  validateInputKey,
}) => {
  const [defaultValidateInput, setDefaultValidateInput] = useState("");
  const toast = useToast();
  const router = useRouter();
  const { data, isLoading, isSuccess } = useQuery({
    queryKey: [`get${entityName}`, entityId],
    queryFn: () => fetchEntity(deleteApiUrl, entityId),
  });
  const deleteMutation = useMutation({
    mutationKey: ["delete", entityName, entityId],
    mutationFn: () => deleteEntity(deleteApiUrl, entityId),
    onSuccess: () => {
      toast.add({
        title: "Success",
        description: `${entityName} deleted successfully`,
      }),
        router.push(redirectUrl || `/${deleteApiUrl}`);
    },
    onError: (err) => {
      toast.add({
        type: "error",
        title: `Failed to delete ${entityName}`,
        description: parseSchedjuiceApiError(
          err,
          `Failed to delete ${entityName}`
        ),
      });
    },
  });
  const [userInput, setUserInput] = useState("");

  useEffect(() => {
    if (isSuccess && data) {
      const row = data.data.data as Record<string, unknown>;
      const key = validateInputKey || "id";
      const raw = row[key];
      const token =
        raw != null && String(raw).trim() !== "" ? String(raw) : String(row.id);
      setDefaultValidateInput(`Delete ${token}`);
    }
  }, [isSuccess, data, validateInputKey]);
  useEffect(() => {
    if (validate_input) {
      setDefaultValidateInput(validate_input);
    }
  }, [validate_input]);

  return (
    <>
      <div className="space-y-3">
        <label
          htmlFor="dangerzone"
          className=" text-destructive text-3xl font-bold "
        >
          Danger zone
        </label>
        <div id="dangerzone" className=" border-destructive mt-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              deleteMutation.mutate();
            }}
          >
            <div>
              <h3>{label || `Delete ${entityName}`}</h3>
              <p>{description}</p>
            </div>
            <div className="space-y-3">
              <p>
                Type{" "}
                <code className="bg-muted px-2 p-1 rounded-md text-muted-foreground">
                  {defaultValidateInput}
                </code>{" "}
                to delete this {entityName}.
              </p>

              <Input
                onChange={(e) => setUserInput(e.target.value)}
                className=" border-destructive"
                placeholder={defaultValidateInput}
              ></Input>
              <Button
                type="submit"
                variant="danger"
                disabled={userInput !== defaultValidateInput}
                isLoading={deleteMutation.isLoading || isLoading}
              >
                Delete
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default DeleteZone;
