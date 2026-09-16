/**
 * Minimal Campus type for SDK list hooks.
 *
 * @source app_course/serializers.py::CampusSerializer
 * (fields = "__all__" on app_course.models.Campus)
 */

export type Campus = {
  id: number;
  name: string;
  description: string;
  location?: string | null;
  is_online: boolean;
  is_default: boolean;
  latitude?: string | number | null;
  longitude?: string | number | null;
  geofence_radius_meters?: number;
};
