export function seededRandom(seed: number) {
    return function () {
      var x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };
  }
  
  function drawHexagon(context: CanvasRenderingContext2D, x: number, y: number, size: number) {
    const angle = (Math.PI * 2) / 6; // 60 degrees in radians for each side of the hexagon
  
    context.beginPath();
    for (let i = 0; i < 6; i++) {
      const dx = x + size * Math.cos(angle * i);
      const dy = y + size * Math.sin(angle * i);
      if (i === 0) {
        context.moveTo(dx, dy);
      } else {
        context.lineTo(dx, dy);
      }
    }
    context.closePath();
    context.fill();
  }
  
  export function generatePattern(
    width: number = 330,
    height: number = 100,
    cellSize: number, 
    seed: number
  ): string | null {
    const safeSeed = Number.isFinite(seed) ? Math.floor(Math.abs(seed)) : 0;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
  
    if (!context) {
      console.error("Failed to get 2D context");
      return null;
    }
  
    canvas.width = width + (width * 0.2);
    canvas.height = height + (height * 0.2);
  
    const cols = Math.ceil((width + (width * 0.2)) / (cellSize * 1.5)); 
    const rows = Math.ceil(height + (height * 0.2)) / (cellSize * Math.sqrt(3)); 

    const seededRandomFn = seededRandom(safeSeed);
    const baseHue = seededRandomFn() * 360;
  
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
    
        const x = i * cellSize * 1.5;
        const y = j * cellSize * Math.sqrt(3) + (i % 2 === 0 ? 0 : cellSize * Math.sqrt(3) / 2);
  

        const lightness = 52 + seededRandomFn() * 18;
        const color = `hsl(${baseHue}, 38%, ${lightness}%)`;
        context.fillStyle = color;
  

        drawHexagon(context, x, y, cellSize);
      }
    }
  
    return canvas.toDataURL();
  }
  