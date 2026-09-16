"use client";

import { TeacherAssignmentPanel } from "@/components/course/teacher-assignment/teacher-assignment-panel";
import type { courseType } from "@/types/course";

interface IMemberEditTabProps {
  course: courseType;
}

const MemberEditTab: React.FC<IMemberEditTabProps> = ({ course }) => {
  return (
    <div className="space-y-3">
      <TeacherAssignmentPanel course={course} />
    </div>
  );
};

export default MemberEditTab;
