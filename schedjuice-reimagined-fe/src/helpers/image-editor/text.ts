import useImageEditorStore, { ImageEditorState } from "@/store/image-editor";
import { Handle } from "./handle";

const HANDLE_WIDTH = 8;

export function getLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) {
  var words = text.split(" ");
  var lines = [];
  var currentLine = words[0];

  for (var i = 1; i < words.length; i++) {
    var word = words[i];
    var width = ctx.measureText(currentLine + " " + word).width;
    if (width < maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}
class TextElement {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  context: CanvasRenderingContext2D;
  imageEditorState: ImageEditorState;
  index: number;
  drawBgImage: any;
  lastBoundingBoxPosition: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null = null;

  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  handles: Handle[] = [];
  fontStyle: "bold" | "italic" | "normal" = "normal";
  showControls: boolean = true;
  constructor(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    fontFamily: string,
    color: string,
    context: CanvasRenderingContext2D,
    drawBgImage: any,
    index: number,
    fontStyle: "bold" | "italic" | "normal" = "normal",
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    },
    showControls: boolean = true
  ) {
    this.imageEditorState = useImageEditorStore.getState();
    this.text = text;
    this.x = x;
    this.y = y;
    this.fontSize = fontSize;
    this.fontFamily = fontFamily;
    this.fontStyle = fontStyle;
    this.color = color;
    this.context = context;
    this.context.textAlign = "center";
    this.context.font = `${this.fontSize}px ${this.fontFamily}`;
    this.context.fillStyle = this.color;
    const textMetrics = this.context.measureText(this.text);
    this.drawBgImage = drawBgImage;

    if (boundingBox) {
      this.boundingBox = JSON.parse(JSON.stringify(boundingBox));
    } else {
      this.boundingBox = {
        x: this.x - textMetrics.width / 2,
        y: this.y,
        width: textMetrics.width,
        height:
          textMetrics.actualBoundingBoxDescent -
          textMetrics.actualBoundingBoxAscent,
      };
    }

    this.index = index;
    this.showControls = showControls;
    this.createHandles();
  }
  createHandles() {
    this.handles = [];
    // this.handles.push(
    //   new Handle(
    //     this.boundingBox.x - HANDLE_WIDTH / 2,
    //     this.boundingBox.y + this.boundingBox.height - HANDLE_WIDTH / 2,
    //     HANDLE_WIDTH,
    //     HANDLE_WIDTH,
    //     this.context,
    //     0,
    //     this
    //   )
    // );
    // this.handles.push(
    //   new Handle(
    //     this.boundingBox.x + this.boundingBox.width / 2 - HANDLE_WIDTH / 2,
    //     this.boundingBox.y + this.boundingBox.height - HANDLE_WIDTH / 2,
    //     HANDLE_WIDTH,
    //     HANDLE_WIDTH,
    //     this.context,
    //     1,
    //     this
    //   )
    // );

    // this.handles.push(
    //   new Handle(
    //     this.boundingBox.x + this.boundingBox.width - HANDLE_WIDTH / 2,
    //     this.boundingBox.y + this.boundingBox.height - HANDLE_WIDTH / 2,
    //     HANDLE_WIDTH,
    //     HANDLE_WIDTH,
    //     this.context,
    //     2,
    //     this
    //   )
    // );
    this.handles.push(
      new Handle(
        this.boundingBox.x + this.boundingBox.width - HANDLE_WIDTH / 2,
        this.boundingBox.y + this.boundingBox.height / 2 - HANDLE_WIDTH / 2,
        HANDLE_WIDTH,
        HANDLE_WIDTH,
        this.context,
        3,
        this
      )
    );
    this.handles.push(
      new Handle(
        this.boundingBox.x + this.boundingBox.width - HANDLE_WIDTH / 2,
        this.boundingBox.y - HANDLE_WIDTH / 2,
        HANDLE_WIDTH,
        HANDLE_WIDTH,
        this.context,
        4,
        this
      )
    );
    this.handles.push(
      new Handle(
        this.boundingBox.x + this.boundingBox.width / 2 - HANDLE_WIDTH / 2,
        this.boundingBox.y - HANDLE_WIDTH / 2,
        HANDLE_WIDTH,
        HANDLE_WIDTH,
        this.context,
        5,
        this
      )
    );
    // this.handles.push(
    //   new Handle(
    //     this.boundingBox.x - HANDLE_WIDTH / 2,
    //     this.boundingBox.y - HANDLE_WIDTH / 2,
    //     HANDLE_WIDTH,
    //     HANDLE_WIDTH,
    //     this.context,
    //     6,
    //     this
    //   )
    // );
    this.handles.push(
      new Handle(
        this.boundingBox.x - HANDLE_WIDTH / 2,
        this.boundingBox.y + this.boundingBox.height / 2 - HANDLE_WIDTH / 2,
        HANDLE_WIDTH,
        HANDLE_WIDTH,
        this.context,
        7,
        this
      )
    );
  }
  drawBoundingBox() {
    this.context.strokeStyle = "#03befc";
    this.context.strokeRect(
      this.boundingBox.x,
      this.boundingBox.y,
      this.boundingBox.width,
      this.boundingBox.height
    );
    this.handles.forEach((handle) => {
      handle.draw();
    });
  }
  draw(noBoundingBox = false) {
    this.imageEditorState = useImageEditorStore.getState();
    this.context.font = `${this.fontStyle} ${this.fontSize}px ${this.fontFamily}`;

    this.context.fillStyle = this.color;

    // if bounding box width is less than text width, then split the text into multiple lines
    const textMetrics = this.context.measureText(this.text);
    const lines = getLines(this.context, this.text, this.boundingBox.width);
    let height =
      textMetrics.actualBoundingBoxDescent -
      textMetrics.actualBoundingBoxAscent;
    if (this.boundingBox.width < textMetrics.width) {
      let yPos = this.y;

      let lineHeight = 0.5 * this.fontSize;
      lines.forEach((l, index) => {
        this.context.fillText(l, this.x, yPos);
        yPos -= height - lineHeight;
      });
      // if ((height - lineHeight) * lines.length < this.boundingBox.height) {
      this.boundingBox.height = (height - lineHeight) * lines.length;
      this.boundingBox.y = yPos + (height - lineHeight);
      // }
    } else {
      this.context.fillText(this.text, this.x, this.y);
    }
    if (noBoundingBox || !this.showControls) return;
    this.context.strokeRect(
      this.boundingBox.x,
      this.boundingBox.y,
      this.boundingBox.width,
      this.boundingBox.height
    );
    if (this.imageEditorState.lastSelectedElementIndex === this.index) {
      this.drawBoundingBox();
    }
    this.drawGridLines();
  }
  isPointInsideLastBoundingBox(x: number, y: number) {
    return (
      x > this.lastBoundingBoxPosition!.x &&
      x <
        this.lastBoundingBoxPosition!.x + this.lastBoundingBoxPosition!.width &&
      y < this.lastBoundingBoxPosition!.y &&
      y > this.lastBoundingBoxPosition!.y + this.lastBoundingBoxPosition!.height
    );
  }
  isPointInside(x: number, y: number) {
    return (
      x > this.boundingBox.x - HANDLE_WIDTH &&
      x < this.boundingBox.x + this.boundingBox.width + HANDLE_WIDTH &&
      y < this.boundingBox.y + HANDLE_WIDTH &&
      y > this.boundingBox.y + this.boundingBox.height - HANDLE_WIDTH
    );
  }
  onClick() {
    console.log(this.text);
  }
  drawGridLines(checkOtherElements = true) {
    this.imageEditorState = useImageEditorStore.getState();
    if (this.imageEditorState.lastSelectedElementIndex !== this.index) return;
    this.context.strokeStyle = "#03befc";

    this.context.beginPath();
    this.context.moveTo(this.imageEditorState.canvas!.width / 2, 0);
    this.context.lineTo(
      this.imageEditorState.canvas!.width / 2,
      this.imageEditorState.canvas!.height
    );
    this.context.stroke();
    this.context.beginPath();
    this.context.moveTo(0, this.imageEditorState.canvas!.height / 2);
    this.context.lineTo(
      this.imageEditorState.canvas!.width,
      this.imageEditorState.canvas!.height / 2
    );
    this.context.stroke();

    // draw third lines with a loop
    this.context.beginPath();
    for (
      let i = 0;
      i < this.imageEditorState.canvas!.width;
      i += this.imageEditorState.canvas!.width / 3
    ) {
      this.context.moveTo(i, 0);
      this.context.lineTo(i, this.imageEditorState.canvas!.height);
    }
    for (
      let i = 0;
      i < this.imageEditorState.canvas!.height;
      i += this.imageEditorState.canvas!.height / 3
    ) {
      this.context.moveTo(0, i);
      this.context.lineTo(this.imageEditorState.canvas!.width, i);
    }
    this.context.stroke();

    // draw grid lines centering on the text's bounding box
    this.context.beginPath();
    this.context.strokeStyle = "#03befc";
    // Calculate center of the bounding box
    const centerX = this.boundingBox.x + this.boundingBox.width / 2;
    const centerY = this.boundingBox.y + this.boundingBox.height / 2;
    // Draw vertical line
    this.context.moveTo(centerX, 0);
    this.context.lineTo(centerX, this.imageEditorState.canvas!.height);
    this.context.stroke();
    // Draw horizontal line
    this.context.beginPath();
    this.context.moveTo(0, centerY);
    this.context.lineTo(this.imageEditorState.canvas!.width, centerY);
    this.context.stroke();
    this.context.closePath();
  }

  moveToPointWithMiddleAnchor(x: number, y: number) {
    this.context.textBaseline = "middle";
    const currentCenterX = this.boundingBox.x + this.boundingBox.width / 2;
    const currentCenterY = this.boundingBox.y + this.boundingBox.height / 2;

    // Calculate the offset needed to move the center to the new coordinates
    const offsetX = x - currentCenterX;
    const offsetY = y - currentCenterY;

    // Update the TextElement's position
    this.x += offsetX;
    this.y += offsetY;

    // Update the bounding box's position to center it on the new coordinates
    this.boundingBox.x += offsetX;
    this.boundingBox.y += offsetY;
    this.context.textBaseline = "top";
  }
  onDrag(offsetX: number, offsetY: number) {
    this.imageEditorState = useImageEditorStore.getState();

    if (this.imageEditorState.mouseDownOrigin) {
      this.x = this.x + (offsetX - this.imageEditorState.mouseDownOrigin[0]);
      this.y = this.y + (offsetY - this.imageEditorState.mouseDownOrigin[1]);
      this.boundingBox.x =
        this.boundingBox.x +
        (offsetX - this.imageEditorState.mouseDownOrigin[0]);
      this.boundingBox.y =
        this.boundingBox.y +
        (offsetY - this.imageEditorState.mouseDownOrigin[1]);
      const newText = new TextElement(
        this.text,
        this.x,
        this.y,
        this.fontSize,
        this.fontFamily,
        this.color,
        this.context,
        this.drawBgImage,
        this.index,
        this.fontStyle,
        this.boundingBox
      );

      this.createHandles();

      this.imageEditorState.modifyAndDrawElement(
        this.index,
        newText,
        this.drawBgImage
      );
    }
  }
  onMouseDown() {
    this.imageEditorState.setSelectedElementIndex(this.index);
    this.imageEditorState.setLastSelectedElementIndex(this.index);
    this.imageEditorState = useImageEditorStore.getState();
  }
}

export { TextElement };
