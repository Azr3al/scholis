"use client";

import {
  makePostRequest,
  searchEntities,
} from "@/app/client-api/utils";
import { PageContainer } from "@/components/layout/page-container";
import { Button, Skeleton, useToast } from "@/components/primitives";
import { TypographyH1 } from "@/components/typography/h1";
import { permissionsFor } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DotsGrid3x3, NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type CategoryRow = { id: number; name: string; sort_order?: number };

function SortableCategoryRow({ item }: { item: CategoryRow }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 0,
      }}
      className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2"
    >
      <button
        type="button"
        aria-label={`Drag to reorder ${item.name}`}
        {...attributes}
        {...listeners}
        className="cursor-grab text-text-muted hover:text-text-primary active:cursor-grabbing"
        style={{ touchAction: "none" }}
      >
        <DotsGrid3x3 className="size-4" />
      </button>
      <span className="text-sm text-text-primary">{item.name}</span>
    </li>
  );
}

export default function CategorySortOrderPage() {
  const { user, isLoading: userLoading } = useUser();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const canManage = user ? permissionsFor(user).can("category.manage") : false;

  useEffect(() => {
    if (!userLoading && user && !canManage) {
      router.replace("/categories");
    }
  }, [userLoading, user, canManage, router]);

  const categoriesQuery = useQuery({
    queryKey: ["categories-sort-order"],
    queryFn: async () => {
      const res = await searchEntities(
        "categories",
        {
          size: -1,
          sorts: ["sort_order", "name"],
          fields: ["id", "name", "sort_order"],
        },
        {},
      );
      return (res.data?.data ?? []) as CategoryRow[];
    },
    enabled: canManage,
  });

  const [items, setItems] = useState<CategoryRow[]>([]);
  useEffect(() => {
    if (categoriesQuery.data) setItems(categoriesQuery.data);
  }, [categoriesQuery.data]);

  const loadedIds = useMemo(
    () => (categoriesQuery.data ?? []).map((c) => c.id).join(","),
    [categoriesQuery.data],
  );
  const dirty =
    items.length > 0 && items.map((c) => c.id).join(",") !== loadedIds;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const saveMutation = useMutation({
    mutationFn: async () =>
      makePostRequest("categories/reorder", {
        ordered_ids: items.map((c) => c.id),
      }),
    onSuccess: () => {
      toast.add({ title: "Category order saved" });
      void queryClient.invalidateQueries({ queryKey: ["categories-sort-order"] });
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: () => {
      toast.add({
        title: "Could not save order",
      });
    },
  });

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  if (userLoading || (user && !canManage)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  return (
    <PageContainer width="wide" className="flex flex-col gap-4">
      <Link
        href="/categories"
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
      >
        <NavArrowLeft className="size-4 shrink-0" aria-hidden />
        Categories
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <TypographyH1>Reorder categories</TypographyH1>
          <p className="text-sm text-text-secondary">
            Drag categories to set the order used in reports and the Course Data
            sheet tabs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!dirty || saveMutation.isPending}
            onClick={() => {
              if (categoriesQuery.data) setItems(categoriesQuery.data);
            }}
          >
            Discard
          </Button>
          <Button
            type="button"
            disabled={!dirty || saveMutation.isPending}
            isLoading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Save order
          </Button>
        </div>
      </div>

      {categoriesQuery.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : categoriesQuery.isError ? (
        <p className="text-sm text-danger">Could not load categories.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">No categories yet.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={items.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <SortableCategoryRow key={item.id} item={item} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </PageContainer>
  );
}
