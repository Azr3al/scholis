import { CampusCheckinVerificationMode } from "@/types/organization";

export type CampusCheckinCampusOption = {
  id: number;
  name: string;
  has_geofence: boolean;
};

export type CampusCheckinStatus = {
  has_checked_in: boolean;
  has_checked_out: boolean;
  can_check_in: boolean;
  can_check_out: boolean;
  verification_mode: CampusCheckinVerificationMode;
  campuses: CampusCheckinCampusOption[];
  today_record: {
    id: number;
    campus_id: number | null;
    date: string;
    actual_checkin_time: string | null;
    actual_checkout_time: string | null;
    checkin_verification_method: string | null;
    checkout_verification_method: string | null;
  } | null;
};
