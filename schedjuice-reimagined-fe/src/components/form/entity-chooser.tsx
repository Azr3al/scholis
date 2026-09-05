import { Button, Checkbox, Input, Separator, Skeleton, buttonVariants, inputClassName } from "@/components/primitives";
import { ScrollArea } from "@/components/misc/scroll-area";
import { accountType } from "@/types/user";
import { useQuery } from "@tanstack/react-query";
import { filterParam, filterParamsBody, operatorEnum } from "@/types/api";
import { makePostRequest } from "@/app/client-api/utils";
import { useEffect, useState } from "react";
import { Xmark as X } from "iconoir-react";
import { cn } from "@/lib/utils";
import { v4 as uuid } from "uuid";
import { usePathname } from "next/navigation";

type CheckedState = boolean | "indeterminate";

export type EntityChooserEntityType = {
  id: number;
  isRemoved?: boolean;
  [key: string]: any;
};

interface IEntityChooserProps {
  entities: EntityChooserEntityType[];
  setEntities: React.Dispatch<React.SetStateAction<EntityChooserEntityType[]>>;
  selectedEntities: EntityChooserEntityType[];
  setSelectedEntities: React.Dispatch<
    React.SetStateAction<EntityChooserEntityType[]>
  >;
  //** Choose how to display the entity to the end user */
  displayFunction: (entity: EntityChooserEntityType) => string;
  //** Choose how the selected entities should be sorted */
  sortFunction: (
    entities: EntityChooserEntityType[]
  ) => EntityChooserEntityType[];
  isCheckDisabled?: (entity: EntityChooserEntityType) => boolean,
  //** Label at the top of the component */
  label: string | React.ReactNode;
  //** The name of the entity (e.g., users, courses) */
  //** Changed to 'url' on 6.11.2023 due to some changes in the backend */
  url: string;
  //** Filter params that will be persisted throughout all the subsequent api calls in this component */
  filterParams?: filterParamsBody;
  //** Which keys to use to search in the search bar (e.g., email, name) */
  searchKeys: string[];
}

const EntityChooser: React.FC<IEntityChooserProps> = ({
  entities,
  setEntities,
  selectedEntities,
  setSelectedEntities,
  displayFunction,
  sortFunction,
  isCheckDisabled= (e) => false,
  label,
  url,
  filterParams = { filter_params: [], exclude_params: [] },
  searchKeys,
}) => {
  const pathname=usePathname()
  // use to differentiate between different EntityChooser component. This is required due to TanstackQuery's caching.
  const [componentId, setComponentId] = useState(uuid());
  // entities selected during the isSearchMode=true. After toggling the search mode, the array will get cleared.
  const [localSelectedEntities, setLocalSelectedEntities] = useState<
    EntityChooserEntityType[]
  >([]);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchValue, setSearchValue] = useState<string>("");
  const { refetch, data, isLoading } = useQuery({
    queryKey: [`search`, url, pathname, componentId, searchValue, filterParams],
    queryFn: () =>
      makePostRequest(url, {
        filter_params: buildFilterParams(filterParams, searchKeys, searchValue),
        exclude_params: buildExcludeParams(),
      }),
    enabled: false,
    refetchOnWindowFocus: true,
    refetchOnMount: true
  });

  const buildExcludeParams = () => {
    const excludedParams = [...(filterParams.exclude_params || [])];
    if (selectedEntities.filter((e) => !e.isRemoved).length > 0) {
      // filtering out already-selected items by their ids

      excludedParams.push({
        field_name: "id",
        operator: operatorEnum.in,
        value: selectedEntities
          .filter((e) => !e.isRemoved)
          .map((e) => e.id)
          .toString(),
      });
    }
    return excludedParams;
  };

  const buildFilterParams = (
    originalFilterParams: filterParamsBody,
    searchKeys: string[],
    searchValue: string,
    operator: operatorEnum = operatorEnum.icontains
  ) => {
    const ret: filterParam[] = [];
    searchKeys.map((k) => {
      if (searchValue !== "") {
        ret.push({ field_name: k, value: searchValue, operator });
      }
    });

    return [...ret, ...(originalFilterParams.filter_params || [])];
  };

  const onAdd = () => {
    const lst: EntityChooserEntityType[] = [];
    localSelectedEntities.map((e) => {
      if (selectedEntities.filter((c) => c.id === e.id).length > 0) {
        e.isRemoved = false;
        lst.push(e);
      }
    });
    setSelectedEntities(
      sortFunction([...selectedEntities, ...localSelectedEntities])
    );
    setIsSearchMode(false);
    setLocalSelectedEntities([]);
  };

  const onRemove = (entity: EntityChooserEntityType) => {
    const lst: EntityChooserEntityType[] = [];
    selectedEntities.map((e) => {
      if (e.id === entity.id) {
        e.isRemoved = true;
      }
      lst.push(e);
    });
    setSelectedEntities(lst);
  };

  const onEntityCheck = (
    entity: EntityChooserEntityType,
    isChecked: CheckedState
  ) => {
    if (isChecked === true) {
      setLocalSelectedEntities([...localSelectedEntities, entity]);
    } else if (isChecked === false) {
      setLocalSelectedEntities(
        localSelectedEntities.filter((e) => e.id !== entity.id)
      );
    }
  };

  useEffect(() => {
    setEntities(sortFunction(data?.data.data));
  }, [data, setEntities]);

  return (
    <>
      <div className="border-none">
        <div className="p-0 pb-3">
          <h3 className="">{label}</h3>
        </div>
        <div className="px-0">
          <div className="flex justify-between gap-3">
            <div className="w-full">
              <Input
                placeholder="search"
                onChange={(e) => setSearchValue(e.target.value)}
                value={searchValue}
                className={cn({ "border-warning": isSearchMode })}
              ></Input>
            </div>
            <Button
              onClick={() => {
                setIsSearchMode(true);
                refetch();
              }}
            >
              search
            </Button>
          </div>
          <p className="text-center mt-2">
            {isSearchMode
              ? `showing searched items (${entities?.length}) | selected (${localSelectedEntities?.length})`
              : `showing selected items (${selectedEntities.length})`}
          </p>
          <div className="mt-2">
            {isSearchMode && (
              <>
                <div className="space-x-3">
                  <Button onClick={() => onAdd()}>Add</Button>
                  <Button
                    variant={"secondary"}
                    onClick={() => setIsSearchMode(false)}
                  >
                    Cancel
                  </Button>
                </div>
                <ScrollArea className="h-72 mt-3">
                  {entities?.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 p-1">
                      <Checkbox
                        id={`${e.id}-checkbox-${componentId}`}
                        onCheckedChange={(isChecked) =>
                          onEntityCheck(e, isChecked)
                        }
                        disabled={isCheckDisabled(e)}
                      />
                      <label htmlFor={`${e.id}-checkbox-${componentId}`}>
                        {displayFunction(e)}
                      </label>
                    </div>
                  ))}
                  {entities?.length === 0 && (
                    <p className="text-center">no result</p>
                  )}
                  {isLoading && (
                    <>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-[90%]"></Skeleton>
                        <Skeleton className="h-4 w-[80%]"></Skeleton>
                        <Skeleton className="h-4 w-[80%]"></Skeleton>
                        <Skeleton className="h-4 w-[70%]"></Skeleton>
                      </div>
                    </>
                  )}
                </ScrollArea>
              </>
            )}
            {!isSearchMode && (
              <>
                {selectedEntities.filter(e => !e.isRemoved).map((e) => (
                  <div key={e.id} className="flex items-center gap-1 ">
                    <p className="p-0 m-0" key={e.id}>
                      {displayFunction(e)}
                    </p>
                    <Button
                      variant={"ghost"}
                      size="sm"
                      onClick={() => onRemove(e)}
                    >
                      <X className=" text-destructive "></X>
                    </Button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default EntityChooser;
