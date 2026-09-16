import useImageEditorStore from "@/store/image-editor";
import { TextElement } from "./text";
import { downloadFile } from "../file";
import { checkVariables } from "../template_parser";
import { parseCsv } from "../csv";
export const getNewTextElement = (oldElem: TextElement) => {
  const {
    text,
    x,
    y,
    fontSize,
    fontFamily,
    color,
    context,
    drawBgImage,
    index,
    fontStyle,
    boundingBox,
  } = oldElem;
  return new TextElement(
    text,
    x,
    y,
    fontSize,
    fontFamily,
    color,
    context,
    drawBgImage,
    index,
    fontStyle,
    boundingBox
  );
};
export const resizeImage = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
  canvas: HTMLCanvasElement
) => {
  const { width: newWidth, height: newHeight } = getRatioedImageDimensions(
    width,
    height,
    maxWidth,
    maxHeight
  );
  // need to create a buffer canvas to resize the image
  const bufferCanvas = document.createElement("canvas");
  const bufferContext = bufferCanvas.getContext("2d");
  bufferContext?.drawImage(canvas, 0, 0);
  bufferCanvas.width = newWidth;
  bufferCanvas.height = newHeight;
  bufferContext?.drawImage(image, x, y, newWidth, newHeight);
  canvas.width = newWidth;
  canvas.height = newHeight;

  context.drawImage(bufferCanvas, 0, 0, newWidth, newHeight);
};
export const drawBackgroundImage = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
  canvas: HTMLCanvasElement,
  setWidth: (width: number) => void,
  setHeight: (height: number) => void
) => {
  const { width: newWidth, height: newHeight } = getRatioedImageDimensions(
    width,
    height,
    maxWidth,
    maxHeight
  );
  // need to create a buffer canvas to resize the image
  const bufferCanvas = document.createElement("canvas");
  const bufferContext = bufferCanvas.getContext("2d");
  bufferContext?.drawImage(canvas, 0, 0);
  bufferCanvas.width = newWidth;
  bufferCanvas.height = newHeight;
  bufferContext?.drawImage(image, x, y, newWidth, newHeight);
  canvas.width = newWidth;
  canvas.height = newHeight;

  context.drawImage(bufferCanvas, 0, 0, newWidth, newHeight);
  setWidth(newWidth);
  setHeight(newHeight);
};

export const drawText = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fontFamily: string,
  color: string,
  drawBgImage: any
) => {
  const { elements, pushElement } = useImageEditorStore.getState();
  const textElem = new TextElement(
    text,
    x,
    y,
    fontSize,
    fontFamily,
    color,
    context,
    drawBgImage,
    elements.length
  );
  pushElement(textElem);

  textElem.draw();
};

export const getRatioedImageDimensions = (
  imageWidth: number,
  imageHeight: number,
  maxWidth: number,
  maxHeight: number
) => {
  const ratio = Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
  return { width: imageWidth * ratio, height: imageHeight * ratio };
};

export const handleOnClick = (e: MouseEvent) => {
  const { elements, setSelectedElementIndex } = useImageEditorStore.getState();
  let isAtLeastOneElementClicked = false;
  elements.forEach((element) => {
    if (element.isPointInside(e.offsetX, e.offsetY)) {
      isAtLeastOneElementClicked = true;
      setSelectedElementIndex(element.index);
      element.onClick();
    }
    if (!isAtLeastOneElementClicked) {
      setSelectedElementIndex(null);
    }
  });
};

export const handleOnMouseMove = (e: MouseEvent, drawBgImage: any) => {
  const {
    elements,
    mouseDownOrigin,
    setMouseDownOrigin,
    setSelectedElementIndex,
    selectedElementIndex,
    setLastSelectedElementIndex,
    lastSelectedHandleIndex,
  } = useImageEditorStore.getState();
  let isAtLeastOneElementDragged = false;
  document.body.style.cursor = "move";
  for (let i = 0; i < elements.length; i++) {
    let isAtLeastOneHandleDragged = false;
    if (lastSelectedHandleIndex) {
      for (let j = 0; j < elements[i].handles.length; j++) {
        if (
          lastSelectedHandleIndex &&
          lastSelectedHandleIndex.parentIndex === i &&
          lastSelectedHandleIndex.handleIndex === elements[i].handles[j].index
        ) {
          elements[i].handles[j].onDrag(e.offsetX, e.offsetY);
          isAtLeastOneHandleDragged = true;
          isAtLeastOneElementDragged = true;
          break;
        }
      }
    }
    if (isAtLeastOneElementDragged) {
      break;
    }
    if (
      elements[i].isPointInside(e.offsetX, e.offsetY) &&
      selectedElementIndex === elements[i].index
    ) {
      elements[i].onDrag(e.offsetX, e.offsetY);
      isAtLeastOneElementDragged = true;
      break;
    }
  }
  if (!isAtLeastOneElementDragged) {
    setSelectedElementIndex(null);
    setLastSelectedElementIndex(null);
  }
  setMouseDownOrigin([e.offsetX, e.offsetY]);
  drawBgImage();
  elements.forEach((element) => {
    element.draw();
  });
};

export const handleOnMouseDown = (e: MouseEvent) => {
  const { elements, setLastSelectedHandleIndex } =
    useImageEditorStore.getState();
  elements.forEach((element) => {
    if (element.isPointInside(e.offsetX, e.offsetY)) {
      element.handles.forEach((handle) => {
        if (handle.isPointInside(e.offsetX, e.offsetY)) {
          setLastSelectedHandleIndex({
            parentIndex: element.index,
            handleIndex: handle.index,
          });
          return;
        }
      });
      element.onMouseDown();
      return;
    }
  });
};

export const validateDocument = (csvJson: Record<string, string>[]) => {
  const { elements } = useImageEditorStore.getState();
  let missingKeys: string[] = [];
  elements.forEach((e) => {
    missingKeys = missingKeys.concat(checkVariables(e.text, csvJson[0]));
  });
  return missingKeys;
};

export const resizeImageWithoutCanvas = (
  file: File,
  onSuccess: (f: File) => void,
  width = 500,
  height = 500
) => {
  let img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      resizeImage(ctx, img, 0, 0, img.width, img.height, width, height, canvas);
    }
    canvas.toBlob((blob) => {
      const f = new File([blob!], `image.jpg`, {
        type: "image/jpeg",
      });
      onSuccess(f);
    }, "image/jpg");
  };
};
