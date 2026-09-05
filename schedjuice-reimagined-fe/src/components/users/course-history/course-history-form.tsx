import { makePostRequest } from "@/app/client-api/utils";
import AutoForm, {
  getObjectFormSchema,
  type AutoFormGroup,
  type AutoFormInputComponentProps,
} from "@/components/auto-form";
import CourseSelect from "@/components/course/course-select";
import { Button, useToast } from "@/components/primitives";
import { setFormErrrors } from "@/helpers/form";
import { queryClient } from "@/lib/query";
import { coursesKeys } from "@/sdk/keys/courses";

import { courseHistoryCreateSchema } from "@/types/course";
import { accountType } from "@/types/user";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useForm, useFormContext } from "react-hook-form";
import * as z from "zod";

interface CourseHistoryFormProps {
  user: accountType;
  setShowForm: (showForm: boolean) => void;
  courseHistory?: [];
}

const COURSE_HISTORY_GROUPS: AutoFormGroup[] = [
  {
    id: "enrollment",
    title: "Course history",
    description: "Link a completed course to this person.",
    fields: ["course", "completion_type", "user"],
  },
];

function CourseHistoryHiddenUserFieldType(_props: AutoFormInputComponentProps) {
  return <></>;
}

function CourseHistoryCourseFieldType({
  field,
  fieldProps,
}: AutoFormInputComponentProps) {
  const existingCourses = fieldProps?.existingCourses as [] | undefined;
  const form = useFormContext();

  return (
    <CourseSelect
      value={field.value ?? form.getValues()["course"]}
      onChange={(v) => {
        field.onChange(v);
        form.setValue("course", v);
      }}
      label="Select a course"
      isRequired
      uniqueSelection={true}
      existingCourses={existingCourses}
    ></CourseSelect>
  );
}

const CourseHistoryForm: React.FC<CourseHistoryFormProps> = ({
  user,
  setShowForm,
  courseHistory,
}) => {
  const toast = useToast();
  const objectFormSchema = getObjectFormSchema(courseHistoryCreateSchema);
  const form = useForm<z.infer<typeof objectFormSchema>>({
    resolver: zodResolver(courseHistoryCreateSchema),
  });

  const courseHistoryCreateMutation = useMutation({
    mutationKey: ["createCourseHistory"],
    mutationFn: (data: any) => {
      return makePostRequest("course-histories", data);
    },
    onSuccess: () => {
      toast.add({
        title: "Success",
        description: "Course history created successfully.",
      });
      setShowForm(false);
      void queryClient.invalidateQueries({
        queryKey: ["getUserCourseHistories"],
      });
      void queryClient.invalidateQueries({ queryKey: coursesKeys.all });
    },
    onError: (e) => {
      setFormErrrors(e, form);
      toast.add({
        title: "Error",
        description: "Failed to create course history.",
      });
    },
  });

  useEffect(() => {
    form.setValue("user", user.id);
  }, [user]);

  const fieldConfig = useMemo(
    () => ({
      user: {
        fieldType: CourseHistoryHiddenUserFieldType,
      },
      course: {
        fieldType: CourseHistoryCourseFieldType,
        inputProps: {
          existingCourses: courseHistory,
        } as Record<string, unknown>,
      },
    }),
    [courseHistory],
  );

  return (
    <div className="">
      <AutoForm
        schema={courseHistoryCreateSchema}
        saveMode="create"
        groups={COURSE_HISTORY_GROUPS}
        form={form}
        stickyFooter={false}
        isSubmitting={courseHistoryCreateMutation.isLoading}
        onSubmit={(data) => courseHistoryCreateMutation.mutate(data)}
        onCancel={() => setShowForm(false)}
        fieldConfig={fieldConfig}
      >
        <div className="mt-3 space-x-3">
          <Button
            type="submit"
            isLoading={courseHistoryCreateMutation.isLoading}
          >
            Submit
          </Button>
          <Button
            type="button"
            onClick={() => setShowForm(false)}
            variant="secondary"
            isLoading={courseHistoryCreateMutation.isLoading}
          >
            Cancel
          </Button>
        </div>
      </AutoForm>
    </div>
  );
};

export default CourseHistoryForm;
