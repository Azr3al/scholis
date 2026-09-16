import { searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";
import type { filterParam } from "@/types/api";
import type { WikiItem } from "@/types/wiki-item";

function getParentFilter(parentId: number | null): filterParam {
  if (parentId == null) {
    return {
      field_name: "parent",
      operator: operatorEnum.isnull,
      value: "true",
    };
  }
  return {
    field_name: "parent",
    operator: operatorEnum.exact,
    value: String(parentId),
  };
}

export function courseItemsQueryKey(courseId: string, parentId: number | null) {
  return ["course-items", courseId, parentId] as const;
}

export async function searchCourseItems(
  courseId: string,
  parentId: number | null = null,
): Promise<WikiItem[]> {
  const response = await searchEntities(
    "items",
    {
      page: 1,
      size: 200,
      sorts: ["name"],
      expand: ["created_by"],
    },
    {
      filter_params: [
        {
          field_name: "course",
          operator: operatorEnum.exact,
          value: courseId,
        },
        getParentFilter(parentId),
      ],
    },
  );
  return (response.data?.data ?? []) as WikiItem[];
}
