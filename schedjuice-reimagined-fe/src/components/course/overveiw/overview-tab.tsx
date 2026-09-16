import CourseHeader from "./course-header";
import { courseType } from "@/types/course";

const OverviewTab = ({ course }: { course: courseType }) => {
  return (
    <div className="flex flex-col gap-6">
      <CourseHeader course={course} />
    </div>
  );
};

export default OverviewTab;
