import { Button, Menu, buttonVariants } from "@/components/primitives";

import { useEffect, useState } from "react";

export type entityType = {
  id: string | number;
};

interface IMultiSelectPopOverProps {
  entities?: entityType[];
  selectedEntities: entityType[];
  setSelectedEntities: React.Dispatch<React.SetStateAction<entityType[]>>;
  displayFunction: (e: any) => string;
  label?: string;
  isAllSelectedDefault?: boolean;
  isSingle?: boolean;
}

const MultiSelectPopOver: React.FC<IMultiSelectPopOverProps> = ({
  entities,
  selectedEntities,
  setSelectedEntities,
  displayFunction,
  label = "Open",
  isAllSelectedDefault = true,
  isSingle = false,
}) => {
  const [isAllSelected, setIsAllSelected] = useState(isAllSelectedDefault);
  const onCheckHandler = (isChecked: boolean, e: entityType) => {
    if (isChecked) {
      const next = [
        ...selectedEntities.filter((c) => c.id !== e.id),
        e,
      ];
      setSelectedEntities(next);
      if (entities?.length && next.length === entities.length) {
        setIsAllSelected(true);
      }
    } else {
      setIsAllSelected(false);
      setSelectedEntities([...selectedEntities.filter((c) => c.id !== e.id)]);
    }
  };
  useEffect(() => {
    if (isAllSelected) {
      setSelectedEntities(entities ?? []);
    }
  }, [isAllSelected, entities]);
  return (
    <>
      <Menu.Root modal>
        <Menu.Trigger render={<Button variant="secondary">
            {isSingle
              ? displayFunction(selectedEntities[0]) || label
              : `${label} (${selectedEntities?.length})`}
          </Button>} />
        <Menu.Portal>
        <Menu.Positioner align="start">
        <Menu.Popup
          className="w-56  overflow-y-auto max-h-[10rem]"
        >
          {!entities?.length ? (
            <p className=" text-center">No data</p>
          ) : (
            <>
              <Menu.CheckboxItem
                checked={isAllSelected}
                onCheckedChange={(c) => {
                  const next = c === true;
                  setIsAllSelected(next);
                  if (!next) {
                    setSelectedEntities([]);
                  }
                }}
              >
                Select all
              </Menu.CheckboxItem>

              {entities?.map((e) => (
                <Menu.CheckboxItem
                  key={e.id}
                  checked={selectedEntities?.map((e) => e.id).includes(e.id)}
                  onCheckedChange={(c) => onCheckHandler(c === true, e)}
                >
                  {displayFunction(e)}
                </Menu.CheckboxItem>
              ))}
            </>
          )}
        </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
      </Menu.Root>
    </>
  );
};

export default MultiSelectPopOver;
