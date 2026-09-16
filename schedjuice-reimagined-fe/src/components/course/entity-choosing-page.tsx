import Link from "next/link";

import { Button } from "@/components/primitives";
import useCourseCreateUpdateStore from "@/store/course-create-update";

import CourseMemberChooser from "./course-member-chooser";
import CourseStudentManager from "./course-student-manager";

interface IEntityChoosingPageProps {
  onSave: () => void;
}

const EntityChoosingPage: React.FC<IEntityChoosingPageProps> = ({ onSave }) => {
  const { courseData } = useCourseCreateUpdateStore((state) => state);

  return (
    <>
      <div className="space-y-3">
        <div className="flex justify-end">
          <Link href={`/courses/${courseData.id}`}>
            <Button onClick={onSave}>Finish</Button>
          </Link>
        </div>
        <div>
          <CourseMemberChooser
           courseId={courseData.id}
           ></CourseMemberChooser>
          <CourseStudentManager course={courseData} />
        </div>
      </div>
    </>
  );
};

export default EntityChoosingPage;
