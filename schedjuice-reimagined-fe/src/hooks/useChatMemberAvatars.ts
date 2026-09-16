"use client";

import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";

/** Fetches course members' avatars and caches them. Returns userId -> profile_image URL. */
export function useChatMemberAvatars(courseId: number | null) {
  const { data } = useQuery({
    queryKey: ["chatMemberAvatars", courseId],
    queryFn: async () => {
      const res = await searchEntities(
        "user-courses",
        {
          size: -1,
          fields: ["user"],
          expand: ["user"],
        },
        {
          filter_params: [
            {
              field_name: "course_id",
              operator: operatorEnum.exact,
              value: String(courseId),
            },
          ],
        }
      );
      const list = (res?.data?.data ?? []) as Array<{
        user?: { id?: number; profile_image?: string | null };
      }>;
      const map: Record<number, string> = {};
      list.forEach((uc) => {
        const u = uc.user;
        if (u?.id && u.profile_image) {
          map[u.id] = u.profile_image;
        }
      });
      return map;
    },
    enabled: Boolean(courseId),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  return data ?? {};
}
