"use client";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { makePostRequest } from "@/app/client-api/utils";
import CsvToTable from "@/components/datatable/csv-to-table";
import FileDragAndDrop, {
  extendedFileType,
  localFileType,
} from "@/components/form/file-drag-and-drop";
import { Button } from "@/components/primitives";
// Legacy toast API (title/description/variant) — primitive useToast is incompatible.
import { useToast } from "@/components/primitives";
import { screenshotVerificationExample } from "@/csv-examples/screenshot-verification";
import { parseCsv } from "@/helpers/csv";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

const VerificationUploadPage = () => {
  const [files, setFiles] = useState<extendedFileType[]>([]);
  const toast = useToast();
  const router = useRouter();

  const onSubmit = () => {
    if (files.length > 0) {
      const f = files[0] as localFileType;
      parseCsv(
        f.file,
        (result) => {
          const nonEmpty = result.filter((r) =>
            Object.values(r).some((v) => v?.trim?.())
          );
          verifyMutation.mutate(
            nonEmpty.map((r) => ({
              amount: parseFloat(r.credit.trim().replaceAll(",", "")),
              transaction_id: r["transaction-id"].trim(),
            }))
          );
        },
        (m) => {
          toast.add({
            title: "Error!",
            description: m,
          });
        }
      );
    } else {
      toast.add({
        title: "Error!",
        description: "Please upload a file",
      });
    }
  };
  const verifyMutation = useMutation({
    mutationKey: ["verify-screenshots"],
    mutationFn: (data: any) => makePostRequest("verify-screenshots", data),
    onSuccess: () => {
      toast.add({
        title: "Success",
        description: "Verification processs has been started.",
      });
      router.push("/finances/student-payments");
    },
    onError: (error: any) => {
      // if 4xx error, toast "Please check your file and try again."
      if(error.status >= 400 && error.status < 500) {
        toast.add({
          title: "Error",
          description: "Please check your file and try again.",
        });
      }
    }
  });
  return (
    <PageContainer width="wide" className="space-y-6">
      <PageHeader
        title="Verify payments from CSV"
        description="Upload a CSV with transaction-id and credit columns. First row must be headers."
      />
      <CsvToTable {...screenshotVerificationExample} />
      <div className="max-w-xl min-w-0 space-y-4">
        <fieldset
          disabled={verifyMutation.isPending}
          className="min-w-0 border-0 p-0 m-0"
        >
        <FileDragAndDrop
          label="Upload a CSV file"
          files={files}
          setFiles={setFiles}
          maxFiles={1}
          isButtonDisabled={verifyMutation.isPending}
        />
        </fieldset>
        <Button
          isLoading={verifyMutation.isPending}
          type="button"
          onClick={onSubmit}
          disabled={files.length === 0 || verifyMutation.isPending}
          className="active:scale-[0.98]"
        >
          Submit verification
        </Button>
      </div>
    </PageContainer>
  );
};

export default VerificationUploadPage;
