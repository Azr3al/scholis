"use client";

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

import { Button } from "@/components/primitives";
import { Checkbox } from "@/components/primitives";

import { Input } from "@/components/primitives";
import { accountType } from "@/types/user";
import { assignedAsEnum, assignedAsRoleType, courseType } from "@/types/course";
import { Select } from "@/components/primitives";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  makeGetRequest,
  makePostRequest,
  searchEntities,
} from "@/app/client-api/utils";
import { Loader } from "../form/loader";
import { filterParamsBody, operatorEnum } from "@/types/api";
import { listToApiArray } from "@/helpers/filter-params";
import { invalidateCourseStudentRosterQueries } from "@/hooks/use-course-student-roster";
import { useToast } from "@/components/primitives";
import { Switch } from "@/components/primitives";
import { InfoCircle as Info, MoreVert } from "iconoir-react";
import { Field } from "@/components/primitives";
import { useTenant } from "@/hooks/useTenant";

export type memberShipType = {
  id: string;
  assigned_as_role?: assignedAsRoleType;
  user: Partial<accountType>;
  course: Partial<courseType>;
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
  courseId: string;
}

const CourseMemberChooser: React.FC<IMemberChooserProps> = ({ courseId }) => {
  const toast = useToast();
  const { tenant } = useTenant();
  const courseRolesEnabled = tenant?.is_course_role_enabled !== false;
  const userType = assignedAsEnum.teacher;
  const [tableData, setTableData] = React.useState<memberShipType[]>([]);
  const [isSearchMode, setIsSearchMode] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");
  const [assignedAsRoleState, setAssignedAsRoleState] = React.useState<any>({});

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState({});

  const [selectAllValue, setSelectAllValue] = React.useState<any>("");

  const getAllAssignedAsRoles = useQuery({
    queryKey: ["getAllAssignedAsRoles"],
    queryFn: () => makeGetRequest("assigned-as-roles", { size: -1 }),
  });
  const assignedRoleItems =
    getAllAssignedAsRoles.data?.data?.data.map((role: any) => ({
      label: role.name,
      value: String(role.id),
    })) ?? [];

  const getUserCourses = useQuery({
    queryKey: ["getUserCourses", courseId],
    queryFn: () => {
      const filterParams: filterParamsBody = {
        filter_params: [],
        exclude_params: [],
      };
      if (searchValue) {
        filterParams.filter_params!.push({
          field_name: "user__email",
          operator: operatorEnum.icontains,
          value: searchValue,
        });
      }
      [
        {
          field_name: "course_id",
          operator: operatorEnum.exact,
          value: String(courseId),
        },
        {
          field_name: "user__roles",
          operator: operatorEnum.contains,
          value: listToApiArray([userType]),
        },
      ].map((c) => {
        filterParams.filter_params!.push(c);
      });
      return searchEntities(
        "user-courses",
        { size: -1, expand: ["user"] },
        {
          filter_params: filterParams.filter_params,
        }
      );
    },
  });

  const searchUsers = useQuery({
    queryKey: ["getAvailableUsers", courseId],
    queryFn: () => {
      const filterParams = [
        {
          field_name: "roles",
          operator: operatorEnum.contains,
          value: listToApiArray([userType]),
        },
      ];
      if (searchValue) {
        filterParams.push({
          field_name: "email",
          operator: operatorEnum.icontains,
          value: searchValue,
        });
      }
      const excludeParams = [];
      if (getUserCourses.data?.data?.data.length > 0) {
        excludeParams.push({
          field_name: "id",
          operator: operatorEnum.in,
          value: getUserCourses.data?.data?.data
            .map((d: any) => d.user.id)
            .join(","),
        });
      }
      return makePostRequest(
        `courses/${courseId}/available-users`,
        {
          exclude_params: excludeParams,
          filter_params: filterParams,
        },
        {
          sorts: ["-created_at"],
        }
      );
    },
    enabled: false,
  });

  const updateUserMutation = useMutation({
    mutationKey: ["updateUser", courseId],
    mutationFn: (data: any) => makePostRequest("user-courses/management", data),
    onSuccess: () => {
      toast.add({ description: "Successfully updated course member assignments." });
      getUserCourses.refetch();
      searchUsers.refetch();
      table.resetRowSelection();
      invalidateCourseStudentRosterQueries(Number(courseId));
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
    if (getUserCourses.isSuccess && getUserCourses.data) {
      if (!isSearchMode) {
        setTableData(getUserCourses.data.data.data);
      }
      const assignedAsRoleStateTemp: any = {};
      getUserCourses.data.data.data.map((d: any) => {
        assignedAsRoleStateTemp[d.user.id] = String(d.assigned_as_role);
      });
      setAssignedAsRoleState(assignedAsRoleStateTemp);
    }
  }, [getUserCourses.data, getUserCourses.isSuccess]);

  React.useEffect(() => {
    if (isSearchMode && searchUsers.isSuccess && searchUsers.data) {
      setTableData(
        searchUsers.data.data.data.map((d: any) => ({ user: d, id: d.id }))
      );
    }
  }, [searchUsers.data, searchUsers.isSuccess, isSearchMode]);

  React.useEffect(() => {
    table.resetRowSelection();
    if (isSearchMode) {
      searchUsers.refetch();
      setTableData(
        searchUsers.data?.data.data.map((d: any) => ({ user: d, id: d.id })) ||
          []
      );
    } else {
      setTableData(getUserCourses.data?.data.data || []);
    }
  }, [isSearchMode]);

  return (
    <div className="w-full space-y-3">
      <div>
        <h2 className="text-2xl font-bold">Edit teachers</h2>

        <p className="text-sm text-muted-foreground">
          The blurred course roles are ones where the teacher has schedule
           conflicts with the course.
        </p>
      </div>
      <div className="flex justify-between items-center gap-3">
        <form
          className="flex justify-between items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (isSearchMode) {
              searchUsers.refetch();
            } else {
              getUserCourses.refetch();
            }
          }}
        >
          <div className="w-full">
            <Input
              placeholder="Search by email"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
            ></Input>
          </div>
          <Button type="submit">Search</Button>
        </form>
        <div className="flex items-center gap-3">
          {isSearchMode ? (
            <div className="space-x-3">
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
                  const toBeUpdatedUserCourses: any = [];

                  let needToAssignRole = false;

                  table.getSelectedRowModel().rows.map((r: any) => {
                    if (
                      courseRolesEnabled &&
                      !assignedAsRoleState[r.original.id]
                    ) {
                      needToAssignRole = true;
                    }
                    const roleId = assignedAsRoleState[r.original.id];
                    const temp = {
                      ...r.original,
                      user: r.original.user.id,
                      course: Number(courseId),
                      assigned_as: userType,
                      ...(courseRolesEnabled && roleId
                        ? { assigned_as_role: Number(roleId) }
                        : {}),
                    };
                    toBeUpdatedUserCourses.push(temp);
                  });

                  if (needToAssignRole) {
                    toast.add({
                      description: "Please assign roles to all selected users.",
                    });
                    return;
                  }
                  updateUserMutation.mutate(toBeUpdatedUserCourses);
                }}
              >
                Add
              </Button>
            </div>
          ) : (
            <div className="space-x-3">
              <Button
                disabled={
                  !(
                    table?.getIsSomeRowsSelected() ||
                    table?.getIsAllRowsSelected()
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
                variant={"danger"}
              >
                Remove
              </Button>

              <Button
                isLoading={updateUserMutation.isLoading}
                onClick={() => {
                  const temp: any[] = [];
                  Object.keys(assignedAsRoleState).map((k: any) => {
                    temp.push({
                      user: Number(k),
                      course: Number(courseId),
                      ...(courseRolesEnabled
                        ? { assigned_as_role: Number(assignedAsRoleState[k]) }
                        : {}),
                      assigned_as: userType,
                    });
                  });
                  updateUserMutation.mutate(temp);
                }}
                type="button"
              >
                Save
              </Button>
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
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => {
                  return (
                    <th key={header.id} className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  );
                })}
                {userType === "teacher" && (
                  <>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">Timslots</th>

                    {courseRolesEnabled && (
                      <th key="action" className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">
                        <div className="my-3">
                          <Select
                            items={assignedRoleItems}
                            onValueChange={(v) => {
                              const assignedAsRoleStateTemp: any = {
                                ...assignedAsRoleState,
                              };

                              table.getSelectedRowModel().rows.map((r: any) => {
                                assignedAsRoleStateTemp[r.original.user?.id] =
                                  String(v);
                              });
                              setAssignedAsRoleState(assignedAsRoleStateTemp);
                              setSelectAllValue(v as string);
                            }}
                            value={selectAllValue}
                            placeholder="Change selected"
                            className="w-[180px]"
                          />
                        </div>
                      </th>
                    )}
                  </>
                )}
              </tr>
            ))}
          </thead>
          <tbody>
            {!(isSearchMode
              ? searchUsers.isLoading
              : getUserCourses.isLoading) &&
            table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="border-b border-border"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="p-2 align-middle">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                  {userType === "teacher" && (
                    <>
                      <td className="flex items-center gap-2 p-2 align-middle">
                        <div>
                          <Checkbox></Checkbox>
                          <label className="text-sm font-medium text-text-secondary">select all</label>
                        </div>
                        <Button variant="ghost" size={"sm"} className="size-8 p-0">
                          <MoreVert />
                        </Button>
                      </td>
                      {courseRolesEnabled && (
                        <td key={row.id + "action"} className="p-2 align-middle">
                          <Select
                            items={(getAllAssignedAsRoles.data?.data?.data ?? [])
                              .filter(
                                (role: any) =>
                                  // @ts-ignore
                                  row.original.user.isFree !== false ||
                                  !role.is_collision_enabled,
                              )
                              .map((role: any) => ({
                                label: role.name,
                                value: String(role.id),
                              }))}
                            value={
                              assignedAsRoleState[
                                // @ts-ignore
                                row.original.user.id || row.original.user
                              ]
                            }
                            onValueChange={(v) => {
                              const temp = { ...assignedAsRoleState };
                              // @ts-ignore
                              temp[row.original.user.id || row.original.user] = v as string;
                              setAssignedAsRoleState(temp);
                            }}
                            placeholder="Assigned As"
                            className="w-[180px]"
                          />
                        </td>
                      )}
                    </>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="h-24 p-2 text-center align-middle"
                >
                  {searchUsers.isLoading || getUserCourses.isLoading ? (
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

export default CourseMemberChooser;
