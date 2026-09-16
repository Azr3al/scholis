const dist = (x1:number, y1:number, x2:number, y2:number) => {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}
// add two vectors
const addVectors = (v1:number[], v2:number[]) => {
    return [v1[0] + v2[0], v1[1] + v2[1]];
}