"use client";

import { PageContainer } from "@/components/layout/page-container";
import { usePageHeader } from "@/components/shell/use-page-header";
import { makePostRequest, searchEntities } from "@/app/client-api/utils";
import EntityCombobox from "@/components/form/entity-combobox";
import FileDragAndDrop, {
  extendedFileType,
  localFileType,
} from "@/components/form/file-drag-and-drop";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import FullScreenImageViewer from "@/components/images/full-screen-image-viewer";
import { Button, Input, Separator } from "@/components/primitives";
import { EntityComboboxList as Combobox } from "@/components/form/entity-combobox-list";
import { useToast } from "@/components/primitives";
import { getCourseStudentFilterParams } from "@/helpers/course";
import {
  getActiveCourseFilterParams,
  getCalendarMonthUtcFilterBounds,
  getCourseMonthType,
} from "@/helpers/date";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import { courseStatus } from "@/types/course";
import { useMutation, useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const ScreenshotCreatePage = () => {
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);

  const [files, setFiles] = useState<extendedFileType[]>([]);
  // this will have exactly the same number of items as files array.
  // the items' indexes will be used to associate these two arrays.
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [paymentIds, setPaymentIds] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<number[]>([]);
  const [descriptions, setDescriptions] = useState<string[]>([]);
  const [remarks, setRemarks] = useState<string[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [transactionIds, setTransactionIds] = useState<string[]>([]);
  const [objUrls, setObjUrls] = useState<string[]>([]);
  const toast = useToast();
  const { user } = useUser()
  const [courseId, setCourseId] = useState<string | undefined>(undefined);
  const [date, setDate] = useState<Date>(new Date());
  const [selectedCourse, setSelectedCourse] = useState<{ start_date?: string } | null>(null);

  const router = useRouter();

  usePageHeader(
    useMemo(
      () => ({
        breadcrumb: (
          <h1 className="font-serif text-lg text-text-primary">
            Batch screenshot upload
          </h1>
        ),
      }),
      [],
    ),
  );

  const getCourseStudent = useQuery({
    enabled: courseId !== undefined,
    queryKey: ["getCourseStudents", courseId],
    queryFn: () =>
      searchEntities(
        "users",
        { size: -1, fields: ["name", "id"], sorts: ["name"] },
        {
          filter_params: getCourseStudentFilterParams(courseId!).filter_params,
        }
      ),
  });

  const studentOptions = useMemo(
    () =>
      (getCourseStudent.data?.data?.data ?? [])
        .filter((s: { id?: unknown; name?: string | null }) => s?.id != null)
        .map((s: { id: number | string; name?: string | null }) => ({
          value: String(s.id),
          label: s.name?.trim() || `User ${s.id}`,
        })),
    [getCourseStudent.data],
  );

  useEffect(() => {
    if (getCourseStudent.isError) {
      toast.add({
        description: "Could not load students for this course.",
      });
    }
  }, [getCourseStudent.isError, toast]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      objUrls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  const submitMutation = useMutation({
    mutationKey: ["submitScreenshots"],
    mutationFn: (data: any) => {
      return makePostRequest(
        "scan-transaction-screenshots",
        data,
        {},
        {
          "Content-Type": "multipart/form-data",
        }
      );
    },
    onSuccess: (data) => {
      toast.add({
        description: data.data.data[0],
      });
      router.push("/finances/student-payments");
    },
  });
  const onSubmit = () => {
    if (files.length === 0) {
      return;
    }
    if (studentIds.includes("")) {
      toast.add({
        description: "Please attach a student to all screenshots.",
      });
      return;
    }
    const issuedBounds = getCalendarMonthUtcFilterBounds(date);
    files.forEach((file, i) => {
      if ("file" in file) {
        const formData = new FormData();
        formData.append("course", courseId!);
        formData.append("issued_at", issuedBounds.start.toISOString());
        formData.append("user", studentIds[i]);
        formData.append(`screenshot`, file.file);
        formData.append("transaction_id", transactionIds[i]);
        if (user && user.id) {
          formData.append("created_by", String(user.id))
        }
        if (amounts[i]) {
          formData.append("parsed_amount", String(amounts[i]));
        }
        if (paymentIds[i]) {
          formData.append("payment_method", paymentIds[i]);
        }
        if (descriptions[i]) {
          formData.append("description", descriptions[i]);
        }
        if (remarks[i]) {
          formData.append("remarks", remarks[i]);
        }
        if (dates[i]) {
          formData.append("date_on_screenshot", dates[i]);
        }

        submitMutation.mutate(formData);
      }
    });
  };

  return  (
<PageContainer width="narrow" className="space-y-6">
      <div className="flex flex-col gap-4">
        <YearMonthSelector
          label="Select a month"
          date={date}
          setDate={setDate}
          monthType={selectedCourse?.start_date ? getCourseMonthType(selectedCourse.start_date) : null}
        />
        <EntityCombobox
          filterParams={{
            filter_params: [...getActiveCourseFilterParams()],
          }}
          queryParams={{ fields: ["title", "id", "start_date"], sorts: ["title"] }}
          displayFunction={(e) => e.title}
          entity="courses"
          value={courseId}
          onChange={(v) => setCourseId(v)}
          label="Select a course"
          onSelectedEntityChange={setSelectedCourse}
        />
      </div>
      <FileDragAndDrop
        label="Upload screenshots"
        files={files}
        setFiles={(newFiles) => {
          // Create maps of existing data indexed by file id
          const existingDataMap = new Map<string, {
            studentId: string;
            paymentId: string;
            amount: number;
            description: string;
            remark: string;
            date: string;
            transactionId: string;
            objUrl: string;
          }>();

          files.forEach((f, i) => {
            if ("file" in f) {
              existingDataMap.set(f.id, {
                studentId: studentIds[i] || "",
                paymentId: paymentIds[i] || "",
                amount: amounts[i] || 0,
                description: descriptions[i] || "",
                remark: remarks[i] || "",
                date: dates[i] || "",
                transactionId: transactionIds[i] || "",
                objUrl: objUrls[i] || "",
              });
            }
          });

          // Clean up object URLs for removed files
          const newFileIds = new Set(newFiles.map(f => f.id));
          objUrls.forEach((url, i) => {
            if (files[i] && !newFileIds.has(files[i].id)) {
              URL.revokeObjectURL(url);
            }
          });

          // Build new arrays preserving existing data and initializing new entries
          const newObjUrls: string[] = [];
          const newStudentIds: string[] = [];
          const newPaymentIds: string[] = [];
          const newAmounts: number[] = [];
          const newDescriptions: string[] = [];
          const newRemarks: string[] = [];
          const newDates: string[] = [];
          const newTransactionIds: string[] = [];

          newFiles.forEach((f) => {
            if ("file" in f) {
              const existingData = existingDataMap.get(f.id);
              if (existingData) {
                // Preserve existing data
                newObjUrls.push(existingData.objUrl || URL.createObjectURL(f.file));
                newStudentIds.push(existingData.studentId);
                newPaymentIds.push(existingData.paymentId);
                newAmounts.push(existingData.amount);
                newDescriptions.push(existingData.description);
                newRemarks.push(existingData.remark);
                newDates.push(existingData.date);
                newTransactionIds.push(existingData.transactionId);
              } else {
                // Initialize new file with empty data
                newObjUrls.push(URL.createObjectURL(f.file));
                newStudentIds.push("");
                newPaymentIds.push("");
                newAmounts.push(0);
                newDescriptions.push("");
                newRemarks.push("");
                newDates.push("");
                newTransactionIds.push("");
              }
            }
          });

          setFiles(newFiles);
          setObjUrls(newObjUrls);
          setStudentIds(newStudentIds);
          setPaymentIds(newPaymentIds);
          setAmounts(newAmounts);
          setDescriptions(newDescriptions);
          setRemarks(newRemarks);
          setDates(newDates);
          setTransactionIds(newTransactionIds);
        }}
        maxFiles={999}
        showCarousel={false}
      />
      <div>
        {files.map((f, i) => {
          if ("file" in f) {
            return (
              <div key={f.id}>
                <Separator className="my-1"></Separator>
                <div className="flex gap-5 items-center">
                  <Image
                    onClick={() => setViewImageUrl(objUrls[i])}
                    className=" object-cover cursor-pointer"
                    width={200}
                    height={300}
                    alt="screenshot"
                    src={objUrls[i]}
                  ></Image>
                  <div className="flex w-full min-w-0 flex-col gap-3">
                    <p className="text-sm text-text-muted">
                      Student name
                    </p>
                    <Combobox
                      value={studentIds[i] || undefined}
                      setValue={(v) => {
                        setStudentIds((prev) => {
                          const next = [...prev];
                          next[i] = v;
                          return next;
                        });
                      }}
                      disabled={!courseId}
                      isLoading={getCourseStudent.isLoading}
                      options={studentOptions}
                      label="Student name"
                    ></Combobox>
                    <EntityCombobox
                      queryParams={{
                        fields: ["name", "id"],
                        sorts: ["name"],
                      }}
                      label="Payment Method"
                      displayFunction={(e) => e.name}
                      entity="payment-methods"
                      value={paymentIds[i]}
                      onChange={(v) => {
                        setPaymentIds((prev) => {
                          const next = [...prev];
                          next[i] = v;
                          return next;
                        });
                      }}
                    ></EntityCombobox>
                    <Input
                      value={transactionIds[i] || undefined}
                      onChange={(e) => {
                        setTransactionIds((prev) => {
                          const next = [...prev];
                          next[i] = e.target.value;
                          return next;
                        });
                      }}
                      placeholder="Transactin ID"
                    ></Input>
                    <div className="relative">
                      <Input
                        value={String(amounts[i]) || undefined}
                        onChange={(e) => {
                          setAmounts((prev) => {
                            const next = [...prev];
                            next[i] = parseFloat(e.target.value);
                            return next;
                          });
                        }}
                        type="number"
                        placeholder="Amount"
                        className="pr-14"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
                        MMK
                      </span>
                    </div>
                    <Input
                      value={descriptions[i] || undefined}
                      onChange={(e) => {
                        setDescriptions((prev) => {
                          const next = [...prev];
                          next[i] = e.target.value;
                          return next;
                        });
                      }}
                      placeholder="Description"
                    ></Input>
                    <Input
                      value={remarks[i] || undefined}
                      onChange={(e) => {
                        setRemarks((prev) => {
                          const next = [...prev];
                          next[i] = e.target.value;
                          return next;
                        });
                      }}
                      placeholder="Remarks"
                    ></Input>
                    <Input
                      value={dates[i] || undefined}
                      onChange={(e) => {
                        setDates((prev) => {
                          const next = [...prev];
                          next[i] = e.target.value;
                          return next;
                        });
                      }}
                      placeholder="Date"
                    ></Input>
                  </div>
                </div>
              </div>
            );
          } else {
            return null;
          }
        })}
      </div>
      <FullScreenImageViewer
        imageUrl={viewImageUrl}
        title="Screenshot"
        onClose={() => setViewImageUrl(null)}
      />

      <Button
        className="w-full sm:w-auto"
        disabled={!courseId || !date}
        isLoading={submitMutation.isLoading}
        onClick={onSubmit}
      >
        Submit for scanning
      </Button>
    </PageContainer>
);
};

export default ScreenshotCreatePage;
