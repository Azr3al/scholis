"use client";
import { Input, Skeleton } from "@/components/primitives";

import { PageContainer } from "@/components/layout/page-container";
import { makePostRequest, searchEntities } from "@/app/client-api/utils";
import { memberShipType } from "@/components/course/course-member-chooser";
import BackButton from "@/components/misc/back-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/courses/ui/table";
import { listToApiArray } from "@/helpers/filter-params";
import { filterParamsBody, operatorEnum } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

const CourseAvailabilityPage = () => {
  const { id } = useParams<{id: string}>();
  const [tableData, setTableData] = useState<memberShipType[]>([]);

  const [searchValue, setSearchValue] = useState("");
  const table = useReactTable({
    data: tableData,
    columns: [
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
    ],
    getCoreRowModel: getCoreRowModel(),
  });
  const getUserCourses = useQuery({
    enabled: false,
    queryKey: ["getUserCourses", id],
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
          value: id,
        },
        {
          field_name: "user__roles",
          operator: operatorEnum.contains,
          value: listToApiArray(["teacher"]),
        },
      ].map((c) => {
        filterParams.filter_params!.push(c);
      });
      return searchEntities(
        "user-courses",
        { size: -1, expand: ["user"], fields: ["user", "user.id", "id"] },
        {
          filter_params: filterParams.filter_params,
        }
      );
    },
  });
  const searchUsers = useQuery({
    queryKey: ["getAvailableUsers", id],
    queryFn: () => {
      const filterParams = [
        {
          field_name: "roles",
          operator: operatorEnum.contains,
          value: listToApiArray(["teacher"]),
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
        `courses/${id}/available-users`,
        {
          exclude_params: excludeParams,
          filter_params: filterParams,
        },
        {
          onlyFree: true,
          size: -1,
          fields: ["id", "email", "name"],
        }
      );
    },
    enabled: false,
  });
  useEffect(() => {
    if (getUserCourses.isSuccess && getUserCourses.data) {
      const assignedAsRoleStateTemp: any = {};
      getUserCourses.data.data.data.map((d: any) => {
        assignedAsRoleStateTemp[d.user.id] = String(d.assigned_as_role);
      });
      searchUsers.refetch();
    }
  }, [getUserCourses.data, getUserCourses.isSuccess]);

  useEffect(() => {
    if (searchUsers.isSuccess && searchUsers.data) {
      setTableData(
        searchUsers.data.data.data.map((d: any) => ({ user: d, id: d.id }))
      );
    }
  }, [searchUsers.data, searchUsers.isSuccess]);

  useEffect(() => {
    getUserCourses.refetch();
  }, []);
  return  (
<PageContainer width="default" className="space-y-3">
      <BackButton href={`/courses/${id}`}></BackButton>
      <div>

      <h1 className=" font-bold text-3xl">Course Availability</h1>
      <p>These are all the users available to this course.</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          searchUsers.refetch();
        }}
      >
        <Input
          value={searchValue}
          onChange={(e) => {
            setSearchValue(e.target.value);
          }}
          placeholder="search"
        ></Input>
      </form>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            return (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  return (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
          {(searchUsers.isLoading || getUserCourses.isLoading) && (
            <TableRow>
              <TableCell>
                <Skeleton className="w-full h-10"></Skeleton>
              </TableCell>
              <TableCell>
                <Skeleton className="w-full h-10"></Skeleton>
              </TableCell>
            </TableRow>
          )}
          {table.getRowModel().rows.length === 0 && !searchUsers.isLoading && (
            <p className=" text-center">No data</p>
          )}
        </TableBody>
      </Table>
    </PageContainer>
);
};

export default CourseAvailabilityPage;
