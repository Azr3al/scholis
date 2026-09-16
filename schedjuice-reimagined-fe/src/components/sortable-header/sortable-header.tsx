import React from "react";
import { flexRender } from "@tanstack/react-table";
import { NavArrowDown as ChevronDown, NavArrowUp as ChevronUp } from "iconoir-react";

interface SortableHeaderProps {
  header: any;
}

export const SortableHeader: React.FC<SortableHeaderProps> = ({ header }) => {
  if (header.placeholder) return null;

  const sorted = header.column.getIsSorted();

  return (
    <div className="flex gap-1">
      {flexRender(header.column.columnDef.header, header.getContext())}
      {{ asc: <ChevronUp width={20} height={20} />, desc: <ChevronDown width={20} height={20} /> }[
        header.column.getIsSorted() as string
      ] ?? null}
    </div>
  );
};
