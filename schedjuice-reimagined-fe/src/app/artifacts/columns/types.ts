import { ColumnDef } from "@tanstack/react-table";
import { ArtifactType } from "../types";
import { entityType } from "@/components/form/multi-select-popover";
import { filterParamsBody } from "@/types/api";

export type ColumnStrategyType = {
  name: string;
  artifact: ArtifactType.COLUMNS;
  getColumns: (entityName: string, tenant?: any) => customColumnDef<any, any>[];
};

export type columnDataType =
  | "date"
  | "string"
  | "number"
  | "select"
  | "muli-select";

export type customColumnDef<T, G> = ColumnDef<T, G> & {
  dataType?: columnDataType;
  accessorKey?: string;
  searchField?: (
    uid: string,
    entities: entityType[],
    setEntity: (entities: entityType[]) => void,
    filterParams?: filterParamsBody
  ) => any;
  isSearchDisabled?: boolean;
  isDefaultVisible?: boolean;
  defaultValue?: any;
  searchValueTransformer?: (value: any) => any;
};

