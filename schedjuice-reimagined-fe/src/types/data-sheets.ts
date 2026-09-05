export type CourseDataSheetRow = {
  course_id: number;
  category_name: string;
  category_sort_order: number;
  title: string;
  start_date: string | null;
  end_date: string | null;
  course_type: "WD" | "WE" | "OTHER" | null;
  student_count: number | null;
  assistant_teacher_count: number | null;
  start_time: string | null;
  end_time: string | null;
  main_teachers: string | null;
  assistant_teachers: string | null;
  current_unit: number | null;
  current_unit_updated_at: string | null;
};

export type StudentCourseChip = { id: number; title: string };

/** Shared identity fields for ID photo panels on data sheets. */
export type IdPhotoSubjectRow = {
  id: number;
  name: string | null;
  code: string | null;
  has_id_photo: boolean;
  blood_type: string | null;
  id_verify_token: string | null;
  id_verify_code: string | null;
  id_card_class_name: string | null;
  id_card_class_display: string | null;
  id_card_expiry_display: string | null;
  nrc_passport: string | null;
  date_of_birth: string | null;
  gender: string | null;
  region: string | null;
  communication_email: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone_number: string | null;
  emergency_contact_relationship: string | null;
};

export type StudentDataSheetRow = IdPhotoSubjectRow & {
  alternative_name: string | null;
  phone_number: string | null;
  city: string | null;
  township: string | null;
  facebook_account_link: string | null;
  house_number: string | null;
  street: string | null;
  country: string | null;
  delivery_address: string | null;
  custom_data: Record<string, unknown>;
  courses: StudentCourseChip[];
};

export type StaffDataSheetRow = IdPhotoSubjectRow & {
  alternative_name: string | null;
  phone_number: string | null;
  city: string | null;
  township: string | null;
  facebook_account_link: string | null;
  roles: string[];
};
