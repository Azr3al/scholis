"use client";

import { PageContainer } from "@/components/layout/page-container";
import {
  deleteEntity,
  makePostRequest,
} from "@/app/client-api/utils";
import DepartmentMemberChooser from "@/components/department/department-member-chooser";
import DeleteZone from "@/components/form/delete-zone";
import GenericForm from "@/components/form/generic-form";
import type { AutoFormGroup } from "@/components/auto-form";
import BackButton from "@/components/misc/back-button";
import {
  Button,
  Dialog,
  Input,
  Tabs,
} from "@/components/primitives";
import {
  ResourceTable,
  column,
  useResourceTableState,
  type Column,
} from "@/components/data-table";
import { useToast } from "@/components/primitives";
import { operatorEnum } from "@/types/api";
import { departmentCreateSchema } from "@/types/department";
import type { Job } from "@/sdk";
import { useJobsList } from "@/sdk/hooks/jobs";
import { useMutation } from "@tanstack/react-query";
import { Trash } from "iconoir-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

const departmentEditGroups: AutoFormGroup[] = [
  {
    id: "details",
    title: "Department",
    fields: ["name", "description"],
  },
];

const DepartmentEditPage = () => {
  const [jobName, setJobName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState(0);
  const toast = useToast();
  const { id } = useParams<{ id: string }>();

  const jobsFilterParams = useMemo(
    () => [
      {
        field_name: "department",
        value: String(id),
        operator: operatorEnum.exact,
      },
    ],
    [id],
  );
  const jobsTableState = useResourceTableState({
    namespace: `job-positions-${id}`,
    syncUrl: false,
  });
  const jobsList = useJobsList({
    page: jobsTableState.page,
    pageSize: jobsTableState.pageSize,
    sorts: jobsTableState.sorts,
    q: jobsTableState.q,
    filterParams: jobsFilterParams,
  });
  const jobColumns: Column<Job>[] = useMemo(
    () => [
      column.text<Job>({
        id: "id",
        header: "ID",
        accessor: (row) => String(row.id),
      }),
      column.text<Job>({
        id: "name",
        header: "Name",
        accessor: (row) => row.name,
      }),
      {
        id: "action",
        header: "Action",
        accessor: () => null,
        cell: ({ row }) => (
          <Button
            className="gap-2"
            variant="danger"
            onClick={() => {
              setSelectedJobId(row.id);
              setIsDeleteDialogOpen(true);
            }}
          >
            <Trash className="size-4 shrink-0" aria-hidden />
            <span>Delete</span>
          </Button>
        ),
      },
    ],
    [],
  );

  const createJobMutation = useMutation({
    mutationKey: ["createJob"],
    mutationFn: (data: any) => makePostRequest("jobs", data),
    onSuccess: () => {
      toast.add({
        title: "Success",
        description: "Job created successfully.",
      });
      setIsDialogOpen(false);
      jobsList.refetch();
    },
    onError: () => {
      toast.add({
        title: "Error",
        description: "Failed to create job.",
      });
    },
  });

  const deleteJobMutation = useMutation({
    mutationKey: ["deleteJob"],
    mutationFn: (jobId: number) => deleteEntity("jobs", jobId),
    onSuccess: () => {
      toast.add({
        title: "Success",
        description: "Job deleted successfully.",
      });
      setIsDeleteDialogOpen(false);
      jobsList.refetch();
    },
    onError: () => {
      toast.add({
        title: "Error",
        description: "Failed to delete job.",
      });
    },
  });

  return (
    <PageContainer width="narrow" className="space-y-3">
      <BackButton href={`/departments/${id}`}></BackButton>
      <Tabs.Root defaultValue="information">
        <Tabs.List>
          <Tabs.Indicator />
          <Tabs.Tab value="information">Information</Tabs.Tab>
          <Tabs.Tab value="members">Members</Tabs.Tab>
          <Tabs.Tab value="job-positions">Job positions</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="information">
          <GenericForm
            isEdit
            autosave
            entityId={id}
            entityName="Department"
            apiUrl="departments"
            schema={departmentCreateSchema}
            groups={departmentEditGroups}
          />
          <DeleteZone
            validateInputKey="name"
            entityName={"Department"}
            entityId={id}
            deleteApiUrl="departments"
          ></DeleteZone>
        </Tabs.Panel>
        <Tabs.Panel value="members">
          <DepartmentMemberChooser
            departmentId={String(id)}
          ></DepartmentMemberChooser>
        </Tabs.Panel>
        <Tabs.Panel value="job-positions" className="space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => {
                setIsDialogOpen(true);
              }}
            >
              New job position
            </Button>

            <Dialog.Root open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <Dialog.Portal>
                <Dialog.Backdrop />
                <Dialog.Popup>
                  <Dialog.Title>New job position</Dialog.Title>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      createJobMutation.mutate({
                        name: jobName,
                        description: "...",
                        department: parseInt(String(id)),
                      });
                    }}
                    className="space-y-3"
                  >
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-text-primary">
                        Name
                      </label>
                      <Input
                        value={jobName}
                        onChange={(e) => {
                          setJobName(e.target.value);
                        }}
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button
                        isLoading={createJobMutation.isLoading}
                        type="submit"
                      >
                        Submit
                      </Button>
                      <Button
                        onClick={() => {
                          setIsDialogOpen(false);
                        }}
                        isLoading={createJobMutation.isLoading}
                        variant="secondary"
                        type="button"
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>

            <Dialog.Root
              onOpenChange={setIsDeleteDialogOpen}
              open={isDeleteDialogOpen}
            >
              <Dialog.Portal>
                <Dialog.Backdrop />
                <Dialog.Popup>
                  <Dialog.Title>Are you sure?</Dialog.Title>
                  <Dialog.Description>
                    Are you sure you want to delete this position?
                  </Dialog.Description>
                  <div className="flex gap-2">
                    <Button
                      isLoading={deleteJobMutation.isLoading}
                      onClick={() => {
                        if (selectedJobId) {
                          deleteJobMutation.mutate(selectedJobId);
                        }
                      }}
                    >
                      Confirm
                    </Button>
                    <Button
                      isLoading={deleteJobMutation.isLoading}
                      onClick={() => setIsDeleteDialogOpen(false)}
                      variant="secondary"
                    >
                      Cancel
                    </Button>
                  </div>
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
          <ResourceTable
            list={jobsList}
            tableState={jobsTableState}
            columns={jobColumns}
            getRowId={(row) => String(row.id)}
          />
        </Tabs.Panel>
      </Tabs.Root>
    </PageContainer>
  );
};
export default DepartmentEditPage;
