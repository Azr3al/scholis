export function layerOriginForViewCenter(args: {
  viewCenterDocument: { x: number; y: number };
  width: number;
  height: number;
}): { x: number; y: number } {
  return {
    x: args.viewCenterDocument.x - args.width / 2,
    y: args.viewCenterDocument.y - args.height / 2,
  };
}
