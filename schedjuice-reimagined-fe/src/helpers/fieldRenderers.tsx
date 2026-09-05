import CategoryMultiSelect from "@/components/category/category-multi-select";
import MultiSelectPopOver, {
  entityType,
} from "@/components/form/multi-select-popover";

import { filterParamsBody } from "@/types/api";

export const renderCategorySelectSearch = (
  uid: string,
  entities: entityType[],
  setEntities: (entities: entityType[]) => void,
  filterParams?: filterParamsBody
) => (
  <CategoryMultiSelect
    selectedCategories={entities}
    setSelectedCategories={setEntities}
    filterParams={filterParams}
    uid={uid}
  ></CategoryMultiSelect>
);
