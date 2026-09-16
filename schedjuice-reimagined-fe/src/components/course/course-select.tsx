import { searchEntities } from "@/app/client-api/utils";
import { Select } from "@/components/primitives";
import { useQuery } from "@tanstack/react-query";
import { Field } from "@/components/primitives";
import { courseType } from "@/types/course";
import { filterParamsBody, operatorEnum } from "@/types/api";

interface ICourseSelectProps {
  value: number;
  onChange: (v: number) => void;
  label?: string;
  isRequired?: boolean;
  formDescription?: string;
  disabled?: boolean;
  categoryId?: number;
  filterParams?: filterParamsBody;
  uniqueSelection?: boolean;
  existingCourses?: [];
}

const CourseSelect: React.FC<ICourseSelectProps> = ({
  value,
  onChange,
  label = "Course",
  isRequired,
  formDescription,
  disabled = false,
  categoryId,
  filterParams,
  uniqueSelection = false,
  existingCourses,
}) => {
  const getAllCourses = useQuery({
    queryKey: ["searchCourses", categoryId],
    queryFn: () => {
      let temp: filterParamsBody = {
        filter_params: filterParams?.filter_params || [],
        exclude_params: filterParams?.exclude_params || [],
      };
      if (categoryId) {
        temp.filter_params?.push({
          field_name: "category_id",
          operator: operatorEnum.exact,
          value: String(categoryId),
        });
      }
      return searchEntities(
        "courses",
        {
          size: -1,
          fields: ["id", "title"],
          sorts: ["title"],
        },
        {
          filter_params: temp.filter_params,
          exclude_params: temp.exclude_params,
        }
      );
    },
  });

  const courses = getAllCourses.data?.data?.data ?? [];
  const existing = existingCourses ?? [];
  const unchosenCourses = courses.filter(
    (item: any) => !existing?.find((i: any) => i.course.id === item.id)
  );
  const selectableCourses = uniqueSelection ? unchosenCourses : courses;

  return (
    <Field.Root className="space-y-3">
      <Field.Label>
        {label} {isRequired && <span className=" text-destructive">*</span>}
      </Field.Label>
      <Select
        items={selectableCourses.map((c: courseType) => ({
          label: c.title,
          value: String(c.id),
        }))}
        value={String(value)}
        onValueChange={(v) => onChange(Number(v as string))}
        disabled={disabled || getAllCourses.isLoading}
        placeholder={getAllCourses.isLoading ? "Loading courses..." : "Select a course"}
        className="max-w-sm"
      />
      {formDescription && <Field.Description>{formDescription}</Field.Description>}
    </Field.Root>
  );
};

export default CourseSelect;
