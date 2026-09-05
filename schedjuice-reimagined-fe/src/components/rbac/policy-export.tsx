"use client";
import { Button } from "@/components/primitives";

import type { Policy } from "@/lib/rbac/synthesize-policy";
import { Printer } from "iconoir-react";

export async function downloadPolicyPdf(roleName: string, policy: Policy) {
  const { pdf } = await import("@react-pdf/renderer");
  const { PolicyPdfDocument } = await import("./policy-pdf-document");
  const { downloadFile } = await import("@/helpers/file");
  const blob = await pdf(
    PolicyPdfDocument({ roleName, policy }),
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const filename = `policy-${roleSlugForFilename(roleName)}.pdf`;
  try {
    downloadFile(url, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function roleSlugForFilename(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "role";
}

type PolicyExportActionsProps = {
  roleName: string;
  policy: Policy;
};

export function PolicyExportActions({
  roleName,
  policy,
}: PolicyExportActionsProps) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button
        type="button"
        variant="secondary" size="sm"
        onClick={() => window.print()}
      >
        <Printer className="mr-1.5 size-4" />
        Print
      </Button>
      <Button
        type="button"
        variant="secondary" size="sm"
        onClick={() => void downloadPolicyPdf(roleName, policy)}
      >
        Export PDF
      </Button>
    </div>
  );
}
