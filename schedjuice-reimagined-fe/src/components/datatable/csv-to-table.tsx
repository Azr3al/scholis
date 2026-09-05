import { Button, Popover, buttonVariants, useToast } from "@/components/primitives";
import { Copy, InfoCircle as Info } from "iconoir-react";

interface ICsvToTableProps {
  headers?: {
    name: string;
    comment: string;
  }[];
  csvData: string[][];
}
const CsvToTable: React.FC<ICsvToTableProps> = ({ headers, csvData }) => {
  const toast = useToast();
  return (
    <>
      {headers && (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              toast.add({
                title: "Copied!",
                description: "Headers copied to clipboard",
              });
              navigator.clipboard.writeText(
                headers.map((h) => h.name).join("\t"),
              );
            }}
            variant={"ghost"}
            className="space-x-3"
          >
            <Copy></Copy>
            <span>Copy headers</span>
          </Button>
        </div>
      )}
      <table>
        {headers && (
          <thead>
            <tr key={"header-001"}>
              {headers?.map((header, index) => (
                <th key={header.name}>
                  <div className="flex items-center gap-3">
                    <span>{header.name}</span>
                    {header.comment && (
                      <Popover.Root>
                        <Popover.Trigger
                          type="button"
                          className="inline-flex items-center text-muted-foreground hover:text-foreground"
                          aria-label={`Info about ${header.name}`}
                        >
                          <Info className="h-4 w-4" />
                        </Popover.Trigger>
                        <Popover.Portal>
        <Popover.Positioner>
        <Popover.Popup>
                          <p>{header.comment}</p>
                        </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
                      </Popover.Root>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {csvData?.map((row, index) => (
            <tr key={`row-${index}`}>
              {row.map((cell, cellIndex) => (
                <td key={`cell-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

export default CsvToTable;
