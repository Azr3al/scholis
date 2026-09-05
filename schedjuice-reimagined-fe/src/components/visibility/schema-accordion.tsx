import { Checkbox } from "@/components/primitives";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/misc/accordion";
import { getTogglableKeys } from "@/types/visibility";
import { useState } from "react";
import * as z from "zod";

interface SchemaAccordionProps {
  selectedColumns: string[];
  setSelectedColumns: (columns: string[]) => void;
  schema: z.Schema<any>;
  label: string;
}

const SchemaAccordion: React.FC<SchemaAccordionProps> = ({
  label,
  selectedColumns,
  setSelectedColumns,
  schema,
}) => {
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);
  const togglableKeys = getTogglableKeys(schema);

  const styleK = (k: string) => {
    return k.replaceAll("_", " ");
  };

  return (
    <div>
      <Accordion
        value={isAccordionOpen ? ["item"] : []}
        onValueChange={(v) => setIsAccordionOpen(v.includes("item"))}
        className="max-w-sm"
      >
        <AccordionItem value="item">
          <div className="flex gap-3 justify-between">
            <div className="flex gap-3 items-center my-1">
              <Checkbox
                checked={
                  selectedColumns.length === Object.keys(togglableKeys).length
                }
                onCheckedChange={(c) => {
                  if (c) {
                    setSelectedColumns(Object.keys(togglableKeys));
                  } else {
                    setSelectedColumns([]);
                  }
                }}
              />
              <label>{label}</label>
            </div>
            <AccordionTrigger>
              <div className="flex justify-between"></div>
            </AccordionTrigger>
          </div>
          <AccordionContent className="pl-3">
            {Object.keys(togglableKeys)
              .sort((a, b) => a.localeCompare(b))
              .map((k: any) => (
                <div key={k} className="flex gap-3 items-center my-1">
                  <Checkbox
                    checked={selectedColumns.includes(k)}
                    onCheckedChange={(c) => {
                      if (c) {
                        setSelectedColumns([...selectedColumns, k]);
                      } else {
                        setSelectedColumns(
                          selectedColumns.filter((c) => c !== k)
                        );
                      }
                    }}
                  />
                  <label className=" capitalize">{styleK(togglableKeys[k].label)}</label>
                </div>
              ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default SchemaAccordion;
