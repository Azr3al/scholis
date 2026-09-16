import { filterParamsBody } from "@/types/api";
import MultiSelectPopOver, { entityType } from "../form/multi-select-popover";
import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";

interface ICategoryMultiSeelct {
  filterParams?: filterParamsBody;

  selectedCategories: entityType[];
  setSelectedCategories: (entities: entityType[]) => void;
  uid: string;
}

const CategoryMultiSelect: React.FC<ICategoryMultiSeelct> = ({
  uid,
  filterParams,
  selectedCategories,
  setSelectedCategories,
}) => {
  const searchCategories = useQuery({
    queryKey: ["searchCategories", uid],
    queryFn: () =>
      searchEntities(
        "categories",
        { size: -1, fields: ["id", "name"], sorts: ["name"] },
        {
          filter_params: filterParams?.filter_params || [],
          exclude_params: filterParams?.exclude_params || [],
        }
      ),
    onSuccess: (data) => {
      setSelectedCategories(data.data?.data ?? []);
    },
  });
  return (
    <MultiSelectPopOver
      label="Filter by category"
      entities={searchCategories.data?.data.data}
      // @ts-ignore
      setSelectedEntities={setSelectedCategories}
      selectedEntities={selectedCategories}
      displayFunction={(e) => e.name}
    ></MultiSelectPopOver>
  );
};

export default CategoryMultiSelect;
