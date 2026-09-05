"use client";
import { Spinner } from "@/components/primitives/spinner";
import { Button, Checkbox, Input, Select, Switch, buttonVariants, inputClassName, useToast } from "@/components/primitives";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowSeparateVertical as ArrowUpDown, NavArrowDown as ChevronDown, MoreHoriz as MoreHorizontal } from "iconoir-react";

import { accountType } from "@/types/user";
import { assignedAsRoleType, courseType } from "@/types/course";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  makeGetRequest,
  makePostRequest,
  searchEntities,
} from "@/app/client-api/utils";
import { Loader } from "../form/loader";
import { operatorEnum } from "@/types/api";
import { listToApiArray } from "@/helpers/filter-params";
import { DepartmentType } from "@/types/department";

export type memberShipType = {
  id: string;
  user: Partial<accountType>;
  department: Partial<DepartmentType>;
};

export const columns: ColumnDef<memberShipType>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={
          table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "email",
    header: "Email",
    cell: ({ row }) => {
      return row.original.user.email;
    },
  },
  {
    id: "name",
    header: "Name",
    cell: ({ row }) => row.original.user.name,
  },
];
interface IMemberChooserProps {
  departmentId: string;
}

const DepartmentMemberChooser: React.FC<IMemberChooserProps> = ({
  departmentId,
}) => {
  const toast = useToast();
  const [tableData, setTableData] = React.useState<memberShipType[]>([]);
  const [isSearchMode, setIsSearchMode] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");
  const [assignedAsJobState, setAssignedAsJobState] = React.useState<any>({});

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState({});

  const getDepartmentJobs = useQuery({
    queryKey: ["getDepartmentJobs"],
    queryFn: () =>
      searchEntities(
        "jobs",
        { size: -1, fields: ["id", "name"] },
        {
          filter_params: [
            {
              field_name: "department",
              operator: operatorEnum.exact,
              value: String(departmentId),
            },
          ],
        }
      ),
  });

  const getUserDepartments = useQuery({
    queryKey: ["getUserDepartments", departmentId],
    queryFn: () =>
      searchEntities(
        "user-departments",
        { size: -1, expand: ["user"] },
        {
          filter_params: [
            {
              field_name: "department_id",
              operator: operatorEnum.exact,
              value: String(departmentId),
            },
          ],
        }
      ),
  });

  const searchUsers = useQuery({
    queryKey: ["getAvailableUsers", departmentId, searchValue],
    queryFn: () => {
      const excludeParams = [];
      if (getUserDepartments.data?.data?.data.length > 0) {
        excludeParams.push({
          field_name: "id",
          operator: operatorEnum.in,
          value: getUserDepartments.data?.data?.data
            .map((d: any) => d.user.id)
            .join(","),
        });
      }
      const q = searchValue.trim();
      return searchEntities(
        `users`,
        {
          size: 50,
          fields: ["id", "name", "email", "alternative_name"],
          sorts: ["name"],
          ...(q.length >= 2 ? { q } : {}),
        },
        {
          exclude_params: excludeParams,
          filter_params: [],
        }
      );
    },
    enabled: false,
  });

  const updateUserMutation = useMutation({
    mutationKey: ["updateUser", departmentId],
    mutationFn: (data: any) =>
      makePostRequest("user-departments/management", data),
    onSuccess: () => {
      toast.add({
        description: "Successfully updated department member assignments.",
      });
      getUserDepartments.refetch();
      setIsSearchMode(false);
      table.resetRowSelection();
    },
  });

  const table = useReactTable({
    data: tableData,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      rowSelection,
    },
  });

  React.useEffect(() => {
    if (
      getUserDepartments.isSuccess &&
      getUserDepartments.data &&
      !isSearchMode
    ) {
      setTableData(getUserDepartments.data.data.data);
      const jobStateTemp: any = {};
      getUserDepartments.data.data.data.map((d: any) => {
        jobStateTemp[d.id] = String(d.job);
      });
      setAssignedAsJobState(jobStateTemp);
    }
  }, [getUserDepartments.data, getUserDepartments.isSuccess, isSearchMode]);

  React.useEffect(() => {
    if (isSearchMode && searchUsers.isSuccess && searchUsers.data) {
      setTableData(
        searchUsers.data.data.data.map((d: any) => ({ user: d, id: d.id }))
      );
    }
  }, [searchUsers.data, searchUsers.isSuccess, isSearchMode]);

  React.useEffect(() => {
    table.resetRowSelection();
  }, [isSearchMode]);

  return (
    <div className="w-full space-y-3">
      <h2 className="text-2xl font-bold">Edit </h2>
      <div className="flex justify-between items-center gap-3">
        <form
          className="flex justify-between items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setIsSearchMode(true);
            searchUsers.refetch();
          }}
        >
          <div className="w-full">
            <Input
              placeholder="Search by name or email"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
            ></Input>
          </div>
          <Button type="submit">Search</Button>
        </form>
        <div className="flex items-center gap-3">
          {isSearchMode ? (
            <div className="flex items-center gap-3">
              <Button
                variant={"secondary"}
                type="button"
                onClick={() => setIsSearchMode(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  !(
                    table.getIsSomeRowsSelected() ||
                    table.getIsAllRowsSelected()
                  )
                }
                type="button"
                isLoading={updateUserMutation.isLoading}
                onClick={() => {
                  const toBeUpdatedUserDepartments: any = [];

                  let needToAssignRole = false;

                  table.getSelectedRowModel().rows.map((r: any) => {
                    if (!assignedAsJobState[r.original.id]) {
                      needToAssignRole = true;
                    }
                    const temp = {
                      ...r.original,
                      user: r.original.user.id,
                      department: Number(departmentId),
                      job: Number(assignedAsJobState[r.original.id]),
                    };
                    toBeUpdatedUserDepartments.push(temp);
                  });

                  if (needToAssignRole) {
                    toast.add({
                      description:
                        "Please assign job positions to all selected users.",
                      type: "error",
                    });
                    return;
                  }
                  updateUserMutation.mutate(toBeUpdatedUserDepartments);
                }}
              >
                Add
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Button
                disabled={
                  !(
                    table.getIsSomeRowsSelected() ||
                    table.getIsAllRowsSelected()
                  )
                }
                isLoading={updateUserMutation.isLoading}
                onClick={() => {
                  updateUserMutation.mutate(
                    table.getSelectedRowModel().rows.map((r: any) => ({
                      ...r.original,
                      user: r.original.user.id,
                      isRemoved: true,
                    }))
                  );
                }}
                type="button"
                variant="danger"
              >
                Remove
              </Button>

              <Button type="button">Save</Button>
            </div>
          )}
          <div>
            <div className="flex items-center gap-3">
              <Switch
                checked={isSearchMode}
                onCheckedChange={(c) => setIsSearchMode(c)}
              ></Switch>
              <p>Add more</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-md shadow-lg">
        <table className="">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <th key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  );
                })}
                {
                  <th key="action">
                    <div className="my-3">
                      <Select
                        className="max-w-[160px]"
                        placeholder="Change selected"
                        items={(getDepartmentJobs.data?.data?.data ?? []).map(
                          (job: any) => ({
                            value: String(job.id),
                            label: job.name,
                          }),
                        )}
                      />
                    </div>
                  </th>
                }
              </tr>
            ))}
          </thead>
          <tbody>
            {!(isSearchMode
              ? searchUsers.isLoading
              : getUserDepartments.isLoading) &&
            table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                  {
                    <td key={row.id + "action"}>
                      <Select
                        disabled={!isSearchMode}
                        value={assignedAsJobState[row.original.id]}
                        onValueChange={(v) => {
                          const temp = { ...assignedAsJobState };
                          temp[row.original.id] = String(v ?? "");
                          setAssignedAsJobState(temp);
                        }}
                        className="max-w-[160px]"
                        placeholder="Assigned As"
                        items={(getDepartmentJobs.data?.data?.data ?? []).map(
                          (role: any) => ({
                            value: String(role.id),
                            label: role.name,
                          }),
                        )}
                      />
                    </td>
                  }
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {searchUsers.isLoading || getUserDepartments.isLoading ? (
                    <>
                      <div className="flex items-center justify-center">
                        <Loader></Loader>
                        <span>Loading...</span>
                      </div>
                    </>
                  ) : (
                    <p>No results.</p>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
      </div>
    </div>
  );
};

export default DepartmentMemberChooser;
