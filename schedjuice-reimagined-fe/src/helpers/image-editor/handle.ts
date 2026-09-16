import { TextElement } from "./text";

const MIN_WIDTH = 20;

class Handle {
  x: number;
  y: number;
  width: number;
  height: number;
  context: CanvasRenderingContext2D;
  // index is used to determine the location of the handle in the bounding box
  // top left is 0, top center is 1, top right is 2, right center is 3, bottom right is 4
  // bottom center is 5, bottom left is 6, left center is 7
  index: number;
  parent: TextElement;

  constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    context: CanvasRenderingContext2D,
    index: number,
    parent: TextElement
  ) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.context = context;
    this.index = index;
    this.parent = parent;
  }
  setCursorStyle() {
    if (this.index === 0 || this.index === 4) {
      document.body.style.cursor = "nwse-resize";
    } else if (this.index === 3 || this.index === 7) {
      document.body.style.cursor = "ew-resize";
    } else if (this.index === 2 || this.index === 6) {
      document.body.style.cursor = "nesw-resize";
    } else if (this.index === 1 || this.index === 5) {
      document.body.style.cursor = "ns-resize";
    }
  }
  draw() {
    this.context.fillStyle = "#ffffff";
    this.context.strokeStyle = "#000000";
    this.context.fillRect(this.x, this.y, this.width, this.height);
    this.context.strokeRect(this.x, this.y, this.width, this.height);
  }
  isPointInside(x: number, y: number) {
    return (
      x > this.x &&
      x < this.x + this.width &&
      y > this.y &&
      y < this.y + this.height
    );
  }
  onDrag(offsetX: number, offsetY: number) {
    this.setCursorStyle();
    if (this.parent.imageEditorState.mouseDownOrigin) {
      if (this.index === 3) {
        const temp =
          this.parent.boundingBox.width +
          (offsetX - this.parent.imageEditorState.mouseDownOrigin[0]);
        if (Math.abs(temp) < MIN_WIDTH) {
          return;
        }
        this.parent.boundingBox.width = temp;
      } else if (this.index === 5) {
        const temp =
          this.parent.boundingBox.height -
          (offsetY - this.parent.imageEditorState.mouseDownOrigin[1]);
        if (Math.abs(temp) < MIN_WIDTH) {
          return;
        }
        this.parent.boundingBox.y =
          this.parent.boundingBox.y +
          (offsetY - this.parent.imageEditorState.mouseDownOrigin[1]);
        this.parent.boundingBox.height = temp;
      } else if (this.index === 7) {
        const temp =
          this.parent.boundingBox.width -
          (offsetX - this.parent.imageEditorState.mouseDownOrigin[0]);
        if (Math.abs(temp) < MIN_WIDTH) {
          return;
        }
        this.parent.boundingBox.x =
          this.parent.boundingBox.x +
          (offsetX - this.parent.imageEditorState.mouseDownOrigin[0]);
        this.parent.boundingBox.width = temp;
      } else if (this.index === 4) {
        const tempWidth =
          this.parent.boundingBox.width +
          (offsetX - this.parent.imageEditorState.mouseDownOrigin[0]);
        const tempHeight =
          this.parent.boundingBox.height -
          (offsetY - this.parent.imageEditorState.mouseDownOrigin[1]);
        if (
          Math.abs(tempWidth) < MIN_WIDTH ||
          Math.abs(tempHeight) < MIN_WIDTH
        ) {
          return;
        }
        this.parent.boundingBox.width = tempWidth;
        this.parent.boundingBox.height = tempHeight;
        this.parent.boundingBox.y =
          this.parent.boundingBox.y +
          (offsetY - this.parent.imageEditorState.mouseDownOrigin[1]);
      }
    }
    this.parent.createHandles();
  }
}
export { Handle };
