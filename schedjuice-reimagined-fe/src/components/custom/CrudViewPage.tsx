import { Button, buttonVariants, type ButtonProps } from "@/components/primitives";
import React from "react";
import { ColumnDef } from "@tanstack/react-table";

export interface ICrudPageProps {
  entitySingularName: string;
  entityPluralName: string;
  listTitle?: string;
  entityArray: any[];
  columnDefs: ColumnDef<any>[];
  createButtonText?: string;
  buttonOnClick?: ButtonProps["onClick"];
}

/**
 * Legacy CRUD shell — body removed; type retained for entity-resolution stubs.
 */
const CrudViewPage: React.FC<ICrudPageProps> = () => {
  return null;
};

export default CrudViewPage;
