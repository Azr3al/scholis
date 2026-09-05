"use client";
import { cn } from "@/lib/utils";
import {
  Button,
  buttonVariants,
  Checkbox,
  Dialog,
  Skeleton,
} from "@/components/primitives";
import { PageContainer } from "@/components/layout/page-container";
import {
  fetchEntity,
  makePostRequest,
  searchEntities,
  updateEntity,
} from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";
import { useJuiceBoxAttachments } from "@/lib/juicebox/use-juicebox-attachments";
import { isRasterImageFilename } from "@/lib/announcement/is-raster-image-filename";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavArrowRight, NavArrowDown, NavArrowUp, EditPencil } from "iconoir-react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { assignmentType, submissionType } from "@/types/assignment";
import { formatDateTime } from "@/helpers/date";
import { useEditor } from "@tiptap/react";
import { getDefaultEditorOptions } from "@/components/editor/config";
import TextEditor from "@/components/editor/editor";
import { useUser } from "@/hooks/useUser";
import Image from "next/image";
import AssignmentSubmissionForm from "@/components/course/assignment-submission-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/courses/ui/card";
import { Badge } from "@/components/courses/ui/badge";
import { isStudent } from "@/helpers/authorization";
import { useToast } from "@/components/primitives";
import { DateTimePicker } from "@/components/courses/ui/date-time-picker";
import { usePageHeader } from "@/components/shell/use-page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/courses/ui/table";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  ColumnDef,
} from "@tanstack/react-table";
import submissionColumns from "@/app/artifacts/columns/default";


const AssignmentDetailsPage: React.FC = () => {
  const { user, isTeacher } = useUser();
  const editor = useEditor(getDefaultEditorOptions());
  const { id } = useParams<{ id: string }>();
  const [tableData, setTableData] = useState<submissionType[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedAttachmentImage, setSelectedAttachmentImage] = useState<
    string | null
  >(null);
  const [showAllOtherFiles, setShowAllOtherFiles] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);

  const { data: attachmentItems = [], isLoading: isAttachmentsLoading } =
    useJuiceBoxAttachments({
      resource: "assignment",
      foreignKey: id,
      enabled: Boolean(id),
    });

  const imageAttachments = useMemo(() => {
    return attachmentItems.filter(
      (file) => file.is_image || isRasterImageFilename(file.filename)
    );
  }, [attachmentItems]);

  const otherAttachments = useMemo(() => {
    return attachmentItems.filter(
      (file) => !(file.is_image || isRasterImageFilename(file.filename))
    );
  }, [attachmentItems]);

  const visibleOtherAttachments = useMemo(() => {
    if (showAllOtherFiles) {
      return otherAttachments;
    }
    return otherAttachments.slice(0, 5);
  }, [otherAttachments, showAllOtherFiles]);

  const { data, isLoading } = useQuery({
    queryKey: ["assignment", id],
    queryFn: () =>
      fetchEntity("assignments", id, [
        "submissions",
        "submissions.created_by",
        "submissions.assignment",
      ]),
  });

  const assignment = data?.data?.data;

  const studentSubmission = useMemo(() => {
    if (!user || !assignment?.submissions?.length) return null;

    const studentSubmissions = assignment.submissions.filter(
      (sub: submissionType) => sub.created_by?.id === user.id
    );

    if (studentSubmissions.length === 0) return null;

    return studentSubmissions.reduce((latest: submissionType, sub: submissionType) =>
      (sub.attempt_count ?? 0) > (latest.attempt_count ?? 0) ? sub : latest
    );
  }, [user, assignment?.submissions]);

  const resubmissionEligibility = useMemo(() => {
    if (!assignment) {
      return {
        canResubmit: false,
        hasAttemptsRemaining: false,
        isAssignmentLocked: false,
        isAssignmentOverdue: false,
      };
    }

    const now = new Date();
    const availableDate = assignment.available_datetime
      ? new Date(assignment.available_datetime)
      : null;
    const dueDate = assignment.due_datetime
      ? new Date(assignment.due_datetime)
      : null;
    const isAssignmentLocked = availableDate ? now < availableDate : false;
    const isAssignmentOverdue = dueDate ? now > dueDate : false;
    const latestAttemptCount = studentSubmission?.attempt_count ?? 0;
    const maxAttempts = assignment.max_attempts ?? 10;
    const hasAttemptsRemaining = latestAttemptCount < maxAttempts;
    const canResubmit =
      hasAttemptsRemaining && !isAssignmentLocked && !isAssignmentOverdue;

    return {
      canResubmit,
      hasAttemptsRemaining,
      isAssignmentLocked,
      isAssignmentOverdue,
    };
  }, [assignment, studentSubmission]);

  useEffect(() => {
    if (!resubmissionEligibility.canResubmit) {
      setIsResubmitting(false);
    }
  }, [resubmissionEligibility.canResubmit]);

  const getStudents = useQuery({
    queryKey: ["getStudents", id, data?.data.data.course],
    queryFn: () =>
      searchEntities(
        "user-courses",
        { size: -1, expand: ["user"] },
        {
          filter_params: [
            {
              field_name: "course",
              value: data?.data.data.course,
              operator: operatorEnum.exact,
            },
          ],
        }
      ),
    enabled: !!data?.data.data.course,
  });

  useEffect(() => {
    if (data?.data.data.submissions?.length > 0) {
      setTableData(data?.data.data.submissions.map((submission: submissionType) => ({
        ...submission,
        is_submitted: true,

      })));
    }
  }, [data?.data.data.submissions]);

  useEffect(() => {
    if (!editor || !data?.data?.data) return;
    const instructions = data.data.data.instructions;
    if (instructions) {
      editor.commands.setContent(instructions, { emitUpdate: false });
    } else {
      editor.commands.clearContent();
    }
  }, [editor, data?.data?.data?.instructions, id]);

  const pageHeaderConfig = useMemo(
    () => ({
      breadcrumb: (
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1.5 text-sm"
        >
          {assignment?.course ? (
            <Link
              href={`/courses/${assignment.course}/assessments`}
              className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
            >
              Assessments
            </Link>
          ) : (
            <span className="shrink-0 text-text-muted">Assessments</span>
          )}
          {assignment?.title ? (
            <>
              <span className="shrink-0 text-text-muted" aria-hidden>
                /
              </span>
              <span className="truncate font-serif text-lg text-text-primary">
                {assignment.title}
              </span>
            </>
          ) : null}
        </nav>
      ),
      actions:
        isTeacher && assignment ? (
          <Link
            href={`/assignments/${id}/edit`}
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            <EditPencil className="mr-1 h-4 w-4" />
            Edit
          </Link>
        ) : undefined,
    }),
    [assignment, id, isTeacher],
  );
  usePageHeader(pageHeaderConfig);

  return  (
<PageContainer width="default" className="w-full h-full p-4">
      <div className="w-full h-full flex gap-4 justify-start items-center mt-3">
        <div className="w-full p-4 border border-border rounded-xl bg-surface">
          <div className="flex flex-col items-start justify-center gap-4">
            <div className="mt-4 text-sm flex flex-col justify-center items-start gap-3">
              <p>
                Posted at: {formatDateTime(data?.data.data.created_at) ?? ""}
              </p>
              <p className="text-red-400">
                Due at: {formatDateTime(data?.data.data.due_datetime) ?? ""}
              </p>
              <p>
                Available Date:{" "}
                {formatDateTime(data?.data.data.available_datetime) ?? ""}
              </p>
              <p>Max Point: {data?.data.data.available_score ?? 0}</p>
            </div>
            <div className="mt-4 w-full max-w-3xl">
              <p className="text-sm mb-2">Description</p>
              {isLoading ? (
                <Skeleton className="h-40 w-full rounded-md" />
              ) : (
                editor && (
                  <TextEditor editor={editor} editable={false} hideMenu />
                )
              )}
            </div>
            <div className="mt-4">
              <p className="text-sm mb-2">Attached Files</p>
              <div className="space-y-4">
                {isAttachmentsLoading ? (
                  <div className="flex gap-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton
                        key={index}
                        className="w-[200px] h-[200px] rounded-lg"
                      />
                    ))}
                  </div>
                ) : attachmentItems.length === 0 ? (
                  <p className="text-sm text-text-secondary">
                    No attachments yet.
                  </p>
                ) : (
                  <>
                    {imageAttachments.length > 0 && (
                      <div className="w-full overflow-x-auto scrollbar-hide pb-2">
                        <div className="flex gap-2 w-[500px]">
                          {imageAttachments.map((file, index) => (
                            <div
                              key={file.id}
                              className="flex-shrink-0 w-[100px] h-[100px] rounded-lg overflow-hidden bg-slate-100"
                            >
                              <Image
                                unoptimized
                                src={file.data}
                                alt={`Attachment image ${index + 1}`}
                                width={200}
                                height={400}
                                onClick={() => {
                                  setSelectedAttachmentImage(file.data);
                                  setIsPreviewOpen(true);
                                }}
                                className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {otherAttachments.length > 0 && (
                      <div className="flex flex-col gap-2">
                        {visibleOtherAttachments.map((file) => {
                          const fileHref = file.public_data || file.data;
                          const isDisabled = !fileHref;
                          return (
                            <a
                              key={file.id}
                              href={fileHref ?? "#"}
                              target={isDisabled ? undefined : "_blank"}
                              rel={
                                isDisabled ? undefined : "noopener noreferrer"
                              }
                              className="text-sm text-primary underline-offset-4 hover:underline"
                            >
                              {file.filename}
                            </a>
                          );
                        })}
                        {otherAttachments.length > 5 && (
                          <div
                            className="mt-4 flex justify-start items-center gap-2 text-sm text-white cursor-pointer"
                            onClick={() =>
                              setShowAllOtherFiles((prev) => !prev)
                            }
                          >
                            <p>
                              {showAllOtherFiles ? "Show less" : "Show more"}
                            </p>
                            {showAllOtherFiles ? (
                              <NavArrowUp width={18} height={18} />
                            ) : (
                              <NavArrowDown width={18} height={18} />
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="w-full">
              {user && isStudent(user) && assignment && (
                <>
                  {studentSubmission ? (
                    <>
                      <Card className="mt-4">
                        <CardHeader>
                          <CardTitle>Your Submission</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <p className="text-sm text-text-secondary">
                                Submitted:{" "}
                                {formatDateTime(studentSubmission.created_at)}
                              </p>
                              <Badge variant="outline">
                                Attempt {studentSubmission.attempt_count}/
                                {assignment.max_attempts}
                              </Badge>
                            </div>

                            {studentSubmission.is_graded &&
                            studentSubmission.are_results_released ? (
                              <div className="space-y-3 pt-2 border-t">
                                <div className="flex items-center gap-4">
                                  <p className="text-lg font-semibold">
                                    Score: {studentSubmission.user_score}/
                                    {assignment.available_score}
                                  </p>
                                  <Badge variant="default" className="bg-green-600">
                                    Graded
                                  </Badge>
                                </div>
                                {studentSubmission.feedback && (
                                  <div>
                                    <p className="font-medium text-sm mb-1">
                                      Teacher Feedback:
                                    </p>
                                    <div className="p-3 bg-surface-hover rounded-md">
                                      <p className="text-sm whitespace-pre-wrap">
                                        {studentSubmission.feedback}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : studentSubmission.is_graded &&
                              !studentSubmission.are_results_released ? (
                              <div className="p-3 bg-yellow-50 dark:bg-yellow-950 rounded-md border border-yellow-200 dark:border-yellow-800">
                                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                  Your submission has been graded. Results will
                                  be released soon.
                                </p>
                              </div>
                            ) : (
                              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                                <p className="text-sm text-blue-800 dark:text-blue-200">
                                  Your submission is pending review.
                                </p>
                              </div>
                            )}

                            {resubmissionEligibility.canResubmit &&
                              !isResubmitting && (
                                <Button
                                  type="button"
                                  className="mt-2"
                                  onClick={() => setIsResubmitting(true)}
                                >
                                  Resubmit
                                </Button>
                              )}

                            {!resubmissionEligibility.hasAttemptsRemaining && (
                              <p className="text-sm text-text-secondary">
                                Maximum attempts reached.
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      {isResubmitting &&
                        resubmissionEligibility.canResubmit && (
                          <div className="mt-4">
                            <AssignmentSubmissionForm
                              assignment={assignment as assignmentType}
                              onCancel={() => setIsResubmitting(false)}
                            />
                          </div>
                        )}
                    </>
                  ) : (
                    <AssignmentSubmissionForm
                      assignment={assignment as assignmentType}
                      onCancel={() => {}}
                    />
                  )}
                </>
              )}
            </div>
            <Dialog.Root
              open={isPreviewOpen}
              onOpenChange={(open) => {
                setIsPreviewOpen(open);
                if (!open) {
                  setSelectedAttachmentImage(null);
                }
              }}
            >
              <Dialog.Portal>
                <Dialog.Backdrop />
                <Dialog.Popup className="w-full max-w-3xl bg-surface p-2 sm:p-4">
                  <Dialog.Title className="sr-only">
                    Attachment preview
                  </Dialog.Title>
                  {selectedAttachmentImage && (
                    <Image
                      unoptimized
                      width={1024}
                      height={1024}
                      src={selectedAttachmentImage}
                      alt="Selected attachment"
                      className="h-full w-full object-contain"
                    />
                  )}
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </div>
      </div>
      {user && !isStudent(user) && (
        <>
          <ResultsReleaseCard
            assignmentId={id as string}
            assignment={data?.data?.data}
            refetchAssignment={() => {
              getStudents.refetch();
            }}
          />
          <SubmissionsTable
            tableData={tableData}
            isLoading={isLoading || getStudents.isLoading}
            assignmentId={id as string}
            refetchAssignment={() => {
              getStudents.refetch();
            }}
          />
        </>
      )}
    </PageContainer>
);
};

interface SubmissionsTableProps {
  tableData: any[];
  isLoading: boolean;
  assignmentId: string;
  refetchAssignment: () => void;
}

const SubmissionsTable: React.FC<SubmissionsTableProps> = ({
  tableData,
  isLoading,
  assignmentId,
  refetchAssignment,
}) => {
  const [rowSelection, setRowSelection] = useState({});
  const toast = useToast();
  const queryClient = useQueryClient();

  const releaseSelectedMutation = useMutation({
    mutationFn: (submissionIds: number[]) =>
      makePostRequest("submissions/bulk-release", {
        submission_ids: submissionIds,
        are_results_released: true,
      }),
    onSuccess: () => {
      toast.add({ description: "Selected results released successfully." });
      setRowSelection({});
      queryClient.invalidateQueries({ queryKey: ["assignment", assignmentId] });
      refetchAssignment();
    },
    onError: () => {
      toast.add({
        description: "Failed to release results",
      });
    },
  });

  const baseColumns = submissionColumns.getColumns("submissions");
  
  const columns: ColumnDef<any>[] = [
    {
      id: "select",
      header: ({ table }) => {
        const selectableRows = table.getRowModel().rows.filter(
          (row) => row.original.is_graded && !row.original.are_results_released
        );
        const allSelectableSelected = selectableRows.length > 0 && 
          selectableRows.every((row) => row.getIsSelected());
        const someSelectableSelected = selectableRows.some((row) => row.getIsSelected());

        return (
          <Checkbox
            checked={allSelectableSelected}
            indeterminate={someSelectableSelected && !allSelectableSelected}
            onCheckedChange={(value) => {
              selectableRows.forEach((row) => {
                row.toggleSelected(!!value);
              });
            }}
            aria-label="Select all selectable"
          />
        );
      },
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          disabled={!row.original.is_graded || row.original.are_results_released}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    ...baseColumns.filter((col: any) => 
      ['created_by__name', 'created_by__email', 'attempt_count', 'user_score'].includes(col.accessorKey)
    ),
    {
      accessorKey: "is_graded",
      header: "Status",
      cell: ({ row }) => {
        if (row.original.is_graded && row.original.are_results_released) {
          return <Badge variant="default" className="bg-green-600">Released</Badge>;
        } else if (row.original.is_graded) {
          return <Badge variant="secondary">Graded (Not Released)</Badge>;
        } else {
          return <Badge variant="outline">Pending</Badge>;
        }
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Link
          href={`/assignments/${assignmentId}/grading/${row.original.id}`}
          className={buttonVariants({ variant: "ghost",
            size: "sm",
           })}
        >
          <NavArrowRight className="h-4 w-4" />
        </Link>
      ),
    },
  ];

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange: setRowSelection,
    state: {
      rowSelection,
    },
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedSubmissionIds = selectedRows.map((row) => row.original.id);
  
  const unreleasedCount = tableData.filter((s: any) => s.is_graded && !s.are_results_released).length;

  return (
    <div className="mt-4 p-4 sm:p-4 border border-border bg-surface rounded-xl">
      <div className="flex flex-col justify-center items-start">
        <div className="flex justify-between items-center w-full mb-2">
          <div>
            <p className="font-medium text-xl">Student Submissions</p>
            <p className="text-xs text-text-secondary mt-1">
              {unreleasedCount} graded submission{unreleasedCount !== 1 ? 's' : ''} not yet released
            </p>
          </div>
          {selectedRows.length > 0 && (
            <div className="flex gap-2 items-center">
              <p className="text-sm text-text-secondary">
                {selectedRows.length} selected
              </p>
              <Button
                onClick={() => releaseSelectedMutation.mutate(selectedSubmissionIds)}
                size="sm"
                isLoading={releaseSelectedMutation.isPending}
              >
                Release Results
              </Button>
            </div>
          )}
        </div>

        <div className="w-full rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No submissions yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

interface ResultsReleaseCardProps {
  assignmentId: string;
  assignment: assignmentType | undefined;
  refetchAssignment: () => void;
}

const ResultsReleaseCard: React.FC<ResultsReleaseCardProps> = ({
  assignmentId,
  assignment,
  refetchAssignment,
}) => {
  const [releaseDate, setReleaseDate] = useState<Date | null>(null);
  const toast = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (assignment?.results_release_date) {
      setReleaseDate(new Date(assignment.results_release_date));
    }
  }, [assignment]);

  const updateReleaseDateMutation = useMutation({
    mutationFn: (date: Date | null) =>
      updateEntity("assignments", assignmentId, {
        results_release_date: date?.toISOString(),
      }),
    onSuccess: () => {
      toast.add({ description: "Results release date updated!" });
      queryClient.invalidateQueries({ queryKey: ["assignment", assignmentId] });
      refetchAssignment();
    },
    onError: () => {
      toast.add({
        description: "Failed to update release date",
      });
    },
  });


  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Results Release Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">
            Scheduled Release Date (Optional)
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <DateTimePicker
                date={releaseDate || new Date()}
                setDate={(date) => setReleaseDate(date)}
              />
            </div>
            <Button
              onClick={() => updateReleaseDateMutation.mutate(releaseDate)}
              variant="secondary"
              className="shrink-0"
              isLoading={updateReleaseDateMutation.isPending}
            >
              Save Date
            </Button>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            All graded submissions will be automatically released on this date
          </p>
        </div>

      </CardContent>
    </Card>
  );
};

export default AssignmentDetailsPage;
