import { TextElement } from "@/helpers/image-editor/text";
import { create } from "zustand";

export interface ImageEditorState {
  canvas: HTMLCanvasElement | null;
  setCanvas: (canvas: HTMLCanvasElement | null) => void;
  elements: TextElement[];
  setElements: (elements: TextElement[]) => void;
  clearElements: () => void;
  clearSelection: () => void;
  pushElement: (element: TextElement) => void;
  modifyElement: (elementIndex: number, element: TextElement) => void;

  modifyAndDrawElement: (
    index: number,
    element: TextElement,
    drawFunction: any
  ) => void;
  removeElement: (index: number, drawFunction: any) => void;

  isMouseDown: boolean;
  setIsMouseDown: (isMouseDown: boolean) => void;

  // the last mouse down position
  mouseDownOrigin: [number, number] | null;
  setMouseDownOrigin: (origin: [number, number] | null) => void;

  // this will reset on mouse up
  selectedElementIndex: number | null;
  setSelectedElementIndex: (index: number | null) => void;

  // this will not reset on mouse up
  lastSelectedElementIndex: number | null;
  setLastSelectedElementIndex: (index: number | null) => void;

  lastSelectedHandleIndex: {
    parentIndex: number;
    handleIndex: number;
  } | null;
  setLastSelectedHandleIndex: (
    index: { parentIndex: number; handleIndex: number } | null
  ) => void;
}

const useImageEditorStore = create<ImageEditorState>((set, get) => ({
  canvas: null,
  setCanvas: (canvas: HTMLCanvasElement | null) => {
    set({ canvas });
  },
  elements: [],
  setElements: (elements: TextElement[]) => {
    set({ elements });
  },
  clearElements: () => {
    set({
      elements: [],
      selectedElementIndex: null,
      lastSelectedElementIndex: null,
      lastSelectedHandleIndex: null,
    });
  },
  clearSelection: () => {
    set({
      selectedElementIndex: null,
      lastSelectedElementIndex: null,
      lastSelectedHandleIndex: null,
    });
  },
  pushElement: (element: TextElement) => {
    set({ elements: [...get().elements, element] });
  },
  modifyElement: (elementIndex: number, element: TextElement) => {
    const nextElements = get().elements.map((existingElement) => {
      if (existingElement.index !== elementIndex) {
        return existingElement;
      }
      return element;
    });
    set({ elements: nextElements });
  },
  removeElement: (index: number, drawFunction: () => void) => {
    const nextElements = get().elements.filter((element) => element.index !== index);
    set({ lastSelectedElementIndex: null, elements: nextElements });

    drawFunction();
    nextElements.forEach((element) => element.draw());
  },
  isMouseDown: false,
  setIsMouseDown: (isMouseDown: boolean) => {
    set({ isMouseDown });
  },
  mouseDownOrigin: null,
  setMouseDownOrigin: (mouseDownOrigin: [number, number] | null) => {
    set({ mouseDownOrigin });
  },
  selectedElementIndex: null,
  setSelectedElementIndex: (selectedElementIndex: number | null) => {
    set({ selectedElementIndex });
  },
  lastSelectedElementIndex: null,
  setLastSelectedElementIndex: (lastSelectedElementIndex: number | null) => {
    set({ lastSelectedElementIndex });
  },
  lastSelectedHandleIndex: null,
  setLastSelectedHandleIndex: (
    lastSelectedHandleIndex: { parentIndex: number; handleIndex: number } | null
  ) => {
    set({ lastSelectedHandleIndex });
  },
  modifyAndDrawElement: (
    index: number,
    element: TextElement,
    drawFunction: () => void
  ) => {
    drawFunction();

    const currentElements = get().elements;
    const nextElements = currentElements.map((existingElement) => {
      if (existingElement.index !== index) {
        return existingElement;
      }
      return element;
    });

    set({ elements: nextElements });

    nextElements.forEach((nextElement) => {
      nextElement.draw();
    });
  },
}));

export default useImageEditorStore;
